# The `emit` processor

## Complains about unknown options
### Juttle
    emit -failure true
    | view result

### Errors
   * unknown emit option failure.

## Complains if -limit isnt a number

### Juttle

    emit -limit "no limits!"  | view result

### Errors

   * CompileError: -limit wants a number, got "no limits!"

## Complains if -hz isnt a number

### Juttle

    emit -hz "so good"  | view result

### Errors

   * CompileError: -hz wants a number, got "so good"

## Complains if -every isnt a duration

### Juttle

    emit -every "so often"  | view result

### Errors

   * CompileError: -every wants a duration, got "so often"

## Complains if -from isnt a moment

### Juttle

    emit -from "never"  | view result

### Errors

   * CompileError: -from wants a moment, got "never"

## Complains if -to isnt a moment

### Juttle

    emit -to "never"  | view result

### Errors

   * CompileError: -to wants a moment, got "never"

## Complains if -last isnt a duration

### Juttle

    emit -last "never"  | view result

### Errors

   * CompileError: -last wants a duration, got "never"

## Complains if -last and -from are specified

### Juttle

    emit -from :yesterday: -last :day: | view result

### Errors

   * CompileError: -last option should not be combined with -from or -to

## Complains if -last and -to are specified

### Juttle

    emit -to :tomorrow: -last :day: | view result

### Errors

   * CompileError: -last option should not be combined with -from or -to

## Complains if -from and -to and -last are specified

### Juttle

    emit -from :yesterday: -to :tomorrow: -last :day: | view result

### Errors

   * CompileError: -last option should not be combined with -from or -to

## Complains if -limit and -to are specified

### Juttle

    emit -limit 1 -to :now: | view result

### Errors

   * -to option should not be combined with -limit

## Complains if -limit and -last are specified

### Juttle

    emit -limit 1 -last :1 minute: | view result

### Errors

   * -to option should not be combined with -limit

## Complains about -points that are not an array

### Juttle

    emit -points "bleat" | view result

### Errors

   * CompileError: emit -points wants an array of points

## Complains about -points that are not an array of objects

### Juttle

    emit -points ["bleat", "blort"] | view result

### Errors

   * CompileError: emit -points wants an array of points

## Complains about -points and -limit

### Juttle

    emit -limit 1 -points [] | view result

### Errors

   * CompileError: -points option should not be combined with -limit

## Complains about -points and -to

### Juttle

    emit -to :+10s: -points [] | view result

### Errors

   * CompileError: -points option should not be combined with -from, -to, or -last

## Complains about -points and -last

### Juttle

    emit -last :10s: -points [] | view result

### Errors

   * CompileError: -points option should not be combined with -from, -to, or -last

## Complains about -points with -from

### Juttle

    emit -from :now: -points [{time: :0:}] | view result

### Errors

   * CompileError: -points option should not be combined with -from, -to, or -last

## Complains about a mix of timeful and timeless -points

### Juttle

    emit -points [{time: :0:}, {foo: "bar"}] | view result

### Errors

   * CompileError: emit -points must all have timestamps or have no timestamps

## Emits 1 point by default

### Juttle

    emit
    | reduce count()
    | view result

### Output

    { count: 1 }

## Emits live points by default

### Juttle

    emit -limit 100
    | put n = count(), dt = time - :now:
    | filter n <= 3
    | keep n, dt
    | view result

### Output

    { n: 1, dt: "00:00:00.000" }
    { n: 2, dt: "00:00:01.000" }
    { n: 3, dt: "00:00:02.000" }

## Does not emit ticks if points are generated every second

### Juttle

    emit -limit 3
    | put n = count(), dt = time - :now:
    | keep n, dt
    | view result -ticks true

### Output

    { n: 1, dt: "00:00:00.000" }
    { n: 2, dt: "00:00:01.000" }
    { n: 3, dt: "00:00:02.000" }

## emits ticks in between long gaps in the points

### Juttle

    emit -limit 3 -every :3s:
    | put n = count(), dt = time - :now:
    | keep n, dt
    | view result -ticks true -dt true

### Output

    { n: 1, dt: "00:00:00.000" }
    { tick: true, dt: "00:00:01.000" }
    { tick: true, dt: "00:00:02.000" }
    { n: 2, dt: "00:00:03.000" }
    { tick: true, dt: "00:00:04.000" }
    { tick: true, dt: "00:00:05.000" }
    { n: 3, dt: "00:00:06.000" }

## Does not emit any points with `-limit 0`

### Juttle

    emit -limit 0 | view result

### Output

```

```

## Emits limited points with -to

### Juttle

    emit -to :now: + :3s:
    | put n = count(), dt = time - :now:
    | keep n, dt
    | view result

### Output

    { n: 1, dt: "00:00:00.000" }
    { n: 2, dt: "00:00:01.000" }
    { n: 3, dt: "00:00:02.000" }

## Emits properly spaced and limited points with -every

### Juttle

    emit -every :2s: -limit 3
    | put n = count(), dt = time - :now:
    | keep n, dt
    | view result

### Output

    { n: 1, dt: "00:00:00.000" }
    { n: 2, dt: "00:00:02.000" }
    { n: 3, dt: "00:00:04.000" }

## Emits properly spaced and limited points with -hz

### Juttle

    emit -hz 0.5 -limit 3
    | put n = count(), dt = time - :now:
    | keep n, dt
    | view result

### Output

    { n: 1, dt: "00:00:00.000" }
    { n: 2, dt: "00:00:02.000" }
    { n: 3, dt: "00:00:04.000" }

## Emits historic points with -from

### Juttle

    emit -from Date.new(0) -limit 3 | view result

### Output

    { "time": "1970-01-01T00:00:00.000Z" }
    { "time": "1970-01-01T00:00:01.000Z" }
    { "time": "1970-01-01T00:00:02.000Z" }

### Output

    { "time": "1970-01-01T00:00:00.000Z" }
    { "time": "1970-01-01T00:00:01.000Z" }
    { "time": "1970-01-01T00:00:02.000Z" }

## Emits the right points when -from, -to, and -every are specified

### Juttle

    emit -from Date.new(0) -to Date.new(10) -every :3s: | view result

### Output

    { "time": "1970-01-01T00:00:00.000Z" }
    { "time": "1970-01-01T00:00:03.000Z" }
    { "time": "1970-01-01T00:00:06.000Z" }
    { "time": "1970-01-01T00:00:09.000Z" }

## Emits the right number of points when -from, -to, and -every are specified

### Juttle

    emit -from :10 seconds ago: -to :now: -every :2 seconds:
    | reduce count()
    | view result

### Output

    { "count": 5 }

## Emits the right number of points when -last and -every are specified

### Juttle

    emit -last :10 seconds: -every :2 seconds:
    | reduce count()
    | view result

### Output

    { "count": 5 }

## Emits historic and live points with -from

### Juttle

    emit -from :-4s: -to :+6s: -every :2s:
    | put n = count(), dt = time - :now:
    | keep n, dt
    | view result -ticks true

### Output

    { n: 1, dt: "-00:00:04.000" }
    { n: 2, dt: "-00:00:02.000" }
    { n: 3, dt: "00:00:00.000" }
    { tick: true }
    { n: 4, dt: "00:00:02.000" }
    { tick: true }
    { n: 5, dt: "00:00:04.000" }

## Emits historic and live points with -points

### Juttle

    emit
        -points [{time: :-2s:, n:1}, {time: :-1s:, n:2}, {time: :+0s:, n:3}, {time: :+1s:, n:4}, {time: :+4s:, n:5}]
    | put dt = time - :now:
    | keep n, dt
    | view result -ticks true

### Output

    { n: 1, dt: "-00:00:02.000" }
    { n: 2, dt: "-00:00:01.000" }
    { n: 3, dt: "00:00:00.000" }
    { n: 4, dt: "00:00:01.000" }
    { tick: true }
    { tick: true }
    { n: 5, dt: "00:00:04.000" }

## Parses time string and numbers in -points

### Juttle

    const points = [
        {time:"1970-01-01"},
        {time:0},
        {time:1},
        {time:"1970-01-01T00:00:02.000Z"}
    ];
    emit -points points
    | view result

### Output
    { time: "1970-01-01T00:00:00.000Z" }
    { time: "1970-01-01T00:00:00.000Z" }
    { time: "1970-01-01T00:00:01.000Z" }
    { time: "1970-01-01T00:00:02.000Z" }

## Complains when no points are given

### Juttle

    emit -points []
    | reduce count()
    | view result

### Output
    { count: 0 }


## Complains about bad time formatting in -points

### Juttle

    emit -points [ {time:"invalid"} ]
    | view result

### Errors
   * the time field must contain a number or a string representing time.

## Does not add timestamps and ticks with timeless -points

### Juttle

    emit
        -points [{n:1}, {n:2}, {n:3}, {n:4}, {n:5}]
    | view result -ticks true

### Output

    { n: 1 }
    { n: 2 }
    { n: 3 }
    { n: 4 }
    { n: 5 }

## Emits correct number of points when -from and -every are set

### Juttle

    emit -from :1 day ago: -every :hour:
    | reduce count()
    | view result

### Output
    { count: 24 }

## Emits correct number of points when -from/-to and -every are set

### Juttle

    emit -from :6 minutes ago: -every :minute: -to :6 minutes from now:
    | reduce count()
    | view result

### Output
    { count: 12 }
