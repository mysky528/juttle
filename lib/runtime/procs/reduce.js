'use strict';

var _ = require('underscore');
var JuttleMoment = require('../../runtime/types/juttle-moment');
var windowMaker = require('./windowmaker');
var periodic_fanin = require('./periodic-fanin');
var errors = require('../../errors');
var Promise = require('bluebird');
var utils = require('../juttle-utils');
var Groups = require('../groups');
var values = require('../values');

var EMIT_BATCH_SIZE = 20000;

var INFO = {
    type: 'proc',
    options: {   // documented, non-deprecated options only
        acc: {},
        every: {},
        forget: {},
        from: {},
        on: {},
        over: {},
        to: {},
        reset: {}
    }
};

class reduce_base extends periodic_fanin {
    // basic reducer runner functions to feed points to reducers and
    // evaluate at epochs.
    constructor(options, params, location, program) {
        super(options, params, location, program);
        var self = this;
        // call this from initialize() if you mix in these functions.
        if (options.over && !options.over.duration) {
            throw this.compile_error('DURATION-ERROR', {
                option: 'over',
                value: values.inspect(options.over)
            });
        }
        if (options.from && !options.from.moment) {
            throw this.compile_error('MOMENT-ERROR', {
                option: 'from',
                value: values.inspect(options.from)
            });
        }
        if (options.to && !options.to.moment) {
            throw this.compile_error('MOMENT-ERROR', {
                option: 'to',
                value: values.inspect(options.to)
            });
        }
        if ((options.from || options.to) && !options.over) {
            throw this.compile_error('FROM-TO-OVER-ERROR', {
                proc: 'reduce'
            });
        }
        this.expr = params.expr || {};
        this.accumulate = options.acc || (options.reset !== undefined && !options.reset);
        this.groups = new Groups(this, options, params.funcMaker);
        if (options.forget && this.accumulate) {
            // if we never reset, forget is meaningless
            throw this.compile_error('FORGET-RESET-ERROR', {
                proc: 'reduce'
            });
        }
        if (options.forget && this.groups.by.length === 0) {
            // suppress empties for non-grouped reduce. behavior not yet implemented
            throw this.compile_error('FORGET-BY-ERROR', {
                proc: 'reduce'
            });
        }
        this.forget = !this.accumulate && (options.forget === undefined) ? (this.groups.by.length > 0) : !!options.forget;
        this.interval = options.every;
        this.batch_size = 0;
        this.over = options.over;
        this.from = options.from;
        this.min_epoch = this.from ? this.from.add(this.over) : null;
        this.to = options.to;
        if (this.over) {
            this.groups.funcMakerMaker = function() {
                // each group row will need its own window of points.
                return windowMaker(self.groups.funcMaker, self.over, self.location);
            };
        }
        this.last_epoch = JuttleMoment.epsMoment(-Infinity);
    }
    witness_timestamp(time) {
        // is time in the half-open interval [from...to), or timeless?
        // return true so it can be processed. Else possibly advance
        // an out-of-window reducer to its final time and return false.
        if (!time || (!this.from || this.from.lte(time)) && (!this.to || this.to.gt(time))) {
            return true;
        }
        if (this.to && this.to.lte(time)) {
            var out = this.advance_epoch(this.to);
            this.emit(out);
        }
        return false;
    }
    process_points(points) {
        var k;
        for (k = 0; k < points.length; ++k) {
            if (this.witness_timestamp(points[k].time)) {
                this.process_pt(points[k]);
                this.batch_size += 1;
            }
        }
    }
    process_pt(pt) {
        // advance/update each reducer on the point
        var row = this.groups.lookup(pt);
        for (var k = 0; k < row.fns.length; ++k) {
            row.fns[k].update(pt);
        }
    }
    good_epoch(time) {
        // is time in the closed interval [min...to]?
        var min = this.min_epoch || this.from;
        return ((!min || min.lte(time)) &&
                (!this.to || this.to.gte(time)));
    }
    advance_epoch(epoch) {
        // we are crossing an epoch timestamp, so execute the reduce at the epoch.
        // output some points, and reset for the next one.
        var that = this, out = [];
        if (!epoch || (this.good_epoch(epoch) && this.last_epoch.lt(epoch))) {
            // new points get the batch end timestamp, eps behind the epoch
            var eob = epoch ? JuttleMoment.epsMoment(epoch) : null;
            this.last_epoch = epoch;
            if (this.over && eob) {
                // advance all group windows and age out old points
                this.groups.apply(function(keyID) {
                    var row = that.groups.get_row(keyID);
                    row.fns.forEach(function(fn) {
                        fn.advance(eob);
                    });
                    if (that.forget && row.fns.is_empty()) {
                        // in windowed group mode, delete any rows
                        // that have no data in their window.  (in
                        // non-windowed mode, regular reset takes care
                        // of this.  in windowed non-group mode, the
                        // non-group lives on to run on an empty
                        // batch)
                        that.groups.delete_group(keyID);
                    }
                });
            }
            this.groups.apply(function(keyID) {
                var row = that.groups.get_row(keyID);
                var fns = row.fns;
                var pt = { };
                // new points get the batch end timestamp
                if (eob) { pt.time = eob; }
                that.groups.mixin_keys(pt, keyID);
                try {
                    that.locate_juttle_errors(function() {
                        that.expr(pt, fns);
                    });
                    out.push(pt);
                } catch(e) {
                    if (e instanceof errors.RuntimeError) {
                        that.trigger('warning', e);
                    } else {
                        throw e;
                    }
                }
            });
        }

        if (!this.accumulate) {
            this.reset();
        }
        this.batch_size = 0;
        if (this.watch_oops && this.groups.by.length > 0) {
            // this.groups.apply() does not iterate groups in time order, so sort them here.
            out.sort(utils.pointSortFunc('time'));
        }
        return out;
    }
    reset() {
        if (this.over || !this.forget) {
            // windowed or remember-groups mode: reset individual rows by calling their funcMakers
            this.groups.reset_fns();
        } else {
            // non-windowed forgetful mode: tear down the whole group table and start over
            this.groups.reset_groups();
        }
    }
    tick(time) {
        // give the tick a chance to advance the reducer if it should.
        if (this.periodic && time.gt(this.program.now)) {
            this.advance(time);
        } else if (!this.periodic && !this.has_first_mark && time.gt(this.program.now)) {
            // For one-shot windowed reducers, a tick may advance if this.to has passed.
            this.witness_timestamp(time);
        }
        this.emit_tick(time);
    }
}


// reduce driven by upstream batches or EOF.
// Mix in grouping and reduce runner behaviors
class reduce_batch extends reduce_base {
    constructor(options, params, location, program) {
        super(options, params, location, program);
        var allowed_options = ['acc', 'every', 'forget', 'from', 'groupby', 'on', 'over', 'reset', 'to', 'no_groupby_warning'];
        this.validate_options(allowed_options);

        // Disable the base class periodic behavior
        this.periodic = false;

        if (options.on) {
            // if we are here, it is because -every is null (likely a
            // default value for an optional -every parameter), or was
            // not specified, but -on was specified with a non-null
            // value.
            throw this.compile_error('ON-NO-EVERY-ERROR', {
                proc: this.procName()
            });
        }
        this.has_first_mark = false;
    }
    procName() {
        return 'reduce';
    }
    process(points) {
        this.process_points(points);
    }
    mark(mark, from) {
        if (this.has_first_mark) {
            var out = this.advance_epoch(mark.time);
            this.emit(out, from);
        } else {
            this.has_first_mark = true;
        }
        // output this mark after any generated points for this batch.
        // those points will get timestamps epsilon less than this
        // batch end mark if they came from a sort/reduce/join
        // processor.
        this.emit_mark({ time: mark.time }, from);
    }
    eof(from) {
        var self = this;
        if (!this.has_first_mark) {
            // unbatched: run once. If -to was specified the one-shot
            // result gets it as the final timestamp (and if it was
            // previously triggered by data or ticks beyond to, this will
            // do nothing)
            var out = this.advance_epoch(this.to);
            return Promise.each(_.range(out.length / EMIT_BATCH_SIZE), function() {
                return Promise.try(function() {
                    self.emit(out.splice(0, EMIT_BATCH_SIZE));
                }).delay(1);
            })
            .then(function() {
                self.emit_eof();
            });
        }
        this.emit_eof();
    }
}

// data-driven reduce. This works like proc._reduce, but with epochs
// specified by -every and -on, and reduce operations triggered when
// timestamps cross epoch boundaries. It ignores any received batch
// marks (except to advance time) and does not emit marks with its results.
// Mix in periodic, grouping, and reduce runner behaviors
class reduce_every extends reduce_base {
    constructor(options, params, location, program) {
        super(options, params, location, program);
        var allowed_options = ['acc', 'every', 'forget', 'from', 'groupby', 'on', 'over', 'reset', 'to', 'no_groupby_warning'];
        this.validate_options(allowed_options);

        if (!options.every.duration) {
            throw this.compile_error('DURATION-ERROR', {
                option: 'every',
                value: values.inspect(options.every)
            });
        }
        if (options.every.seconds() <= 0) {
            throw this.compile_error('REDUCE-EVERY-ERROR');
        }
        if (options.over && !options.over.duration) {
            throw this.compile_error('DURATION-ERROR', {
                option: 'over',
                value: values.inspect(options.over)
            });
        }
        if (options.on) {
            if (options.on.duration) {
                if (options.on.gt(options.every)) {
                    throw this.compile_error('ON-EVERY-ERROR', {
                        proc: this.procName()
                    });
                }
                this.on = (new JuttleMoment(0)).add(options.on);
            } else if (options.on.moment) {
                this.on = options.on;
            } else {
                throw this.compile_error('DURATION-OR-MOMENT-ERROR', {
                    option: 'on',
                    value: values.inspect(options.on)
                });
            }
        } else {
            // if -from or -to are specified, align on them by default.
            this.on = options.from || options.to ;
        }
        this.after_first_epoch = false;
        this.init_warnings();
    }
    procName() {
        return 'reduce';
    }
    first_epoch(epoch) {
        this.after_first_epoch = true;
    }
    //
    // mark() and process() are from periodic. tick() from reduce_runner_funcs
    //

    eof(from) {
        // Edge case - 0 points followed immediately by eof. To be consistent
        // with `batch | reduce`, run aggregation once and emit the result.
        if (!this.batch_size && !this.after_first_epoch) {
            var out = this.advance_epoch(this.next_epoch);
            this.emit(out);
        }
        super.eof(from);
    }

    //
    // mark() and process() are from periodic. tick() from reduce_runner_funcs
    //
    periodic_eof(from) {
        if (this.batch_size) {
            // run once more for a trailing partial batch of points
            var out = this.advance_epoch(this.next_epoch);
            this.emit(out);
        }
        this.emit_eof();
    }
}



// juttle reduce. Whether you get a batch-driven reducer or a
// data-driven reducer with its own epochs is decided by the presence
// of an -every option to reduce.
function reduce(options, params, location, program) {
    return options.every? new reduce_every(options, params, location, program) : new reduce_batch(options, params, location, program);
}

reduce.info = INFO;

module.exports = reduce;
