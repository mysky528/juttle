var expect = require('chai').expect;
var fs = require('fs');
var parsers = require('../../../lib/adapters/parsers');
var path = require('path');

describe('parsers/json', function() {
    var pointFile = path.resolve(__dirname, 'input/json/point.json');
    var pointsFile = path.resolve(__dirname, 'input/json/points.json');
    var invalidFile = path.resolve(__dirname, 'input/json/invalid.json');

    it('can instantiate a json parser', function() {
        var json = parsers.getParser('json');
        expect(json).to.not.be.undefined();
    });

    it('fails when given an invalid JSON stream', function() {
        var json = parsers.getParser('json');
        return json.parseStream(fs.createReadStream(invalidFile))
        .then(function() {
            throw Error('previous statement should have failed');
        })
        .catch(function(err) {
            expect(err.toString()).to.contain('Error: Invalid JSON data');
        });
    });

    it('can parse a file with a single JSON point', function() {
        var json = parsers.getParser('json');
        var results = [];
        return json.parseStream(fs.createReadStream(pointFile), function(result) {
            results.push(result);
        })
        .then(function() {
            expect(results).to.deep.equal([[
                {
                    'time': '2014-01-01T00:00:00.000Z',
                    'foo': 1
                }
            ]]);
        });
    });

    it('can parse a file with multiple JSON points', function() {
        var json = parsers.getParser('json');
        var results = [];
        return json.parseStream(fs.createReadStream(pointsFile), function(result) {
            results.push(result);
        })
        .then(function() {
            expect(results.length).equal(1);
            expect(results).to.deep.equal([[
                { 'time': '2014-01-01T00:00:01.000Z', 'foo': 1 },
                { 'time': '2014-01-01T00:00:02.000Z', 'foo': 2 },
                { 'time': '2014-01-01T00:00:03.000Z', 'foo': 3 }
            ]]);
        });
    });

    it('calls emit multiple times with payload limit specified', function() {
        var json = parsers.getParser('json', { limit: 1 });
        var results = [];
        return json.parseStream(fs.createReadStream(pointsFile), function(result) {
            results.push(result);
        })
        .then(function() {
            expect(results.length).equal(4);
            expect(results).to.deep.equal([
                [{ 'time': '2014-01-01T00:00:01.000Z', 'foo': 1 }],
                [{ 'time': '2014-01-01T00:00:02.000Z', 'foo': 2 }],
                [{ 'time': '2014-01-01T00:00:03.000Z', 'foo': 3 }],
                []
            ]);
        });
    });
});
