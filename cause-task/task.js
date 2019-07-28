const union = require("@algebraic/type/union-new");

const Task = union `Task` (
    is  =>  union `Blocked` (
        is  =>  Cause.Blocked,
        or  =>  Dependent.Blocked,
        or  =>  Guard.Blocked ),
    is  =>  union `Running` (
        is  =>  Cause.Running,
        or  =>  Dependent.Running,
        or  =>  Guard.Running ),
    is  =>  union `Success` (
        is  =>  Cause.Success,
        or  =>  Dependent.Success,
        or  =>  Guard.Success ),
    is  =>  union `Failure` (
        is  =>  Cause.Failure,
        or  =>  Dependent.Failure,
        or  =>  Guard.Failure ) );

Task.Completed = union `Task.Completed` (
    is  =>  Task.Success,
    or  =>  Task.Failure );

Dependency.Completed = union `Task.Dependency.Completed` (
    Dependency.Success,
    Dependency.Failure );


function toPromiseThen(onResolve, onReject)
{
    return require("@cause/cause/to-promise")(Object, this).then(onResolve, onReject);
}

function toPromiseCatch(onReject)
{
    return require("@cause/cause/to-promise")(Object, this).catch(onReject);
}

for (const type of [...union.components(Task), ...union.components(Dependent)])
{
    type.prototype.then = toPromiseThen;
    type.prototype.catch = toPromiseCatch;
}

module.exports = Task;

        
    
    union `Blocked` (
        
        cause => Cause(any) ),
    data `Running` (
        cause => Cause(any) ),
    data `Success` (
        value => any ),
    data `Failure` (
        error => any ) );


const { data, union, is, any } = require("@algebraic/type");
const Cause = require("@cause/cause");
const update = require("@cause/cause/update");
const inspect = Symbol.for("nodejs.util.inspect.custom");


const Task = union `Task` (
    data `Initial` (
        cause => Cause(any) ),
    data `Running` (
        cause => Cause(any) ),
    data `Success` (
        value => any ),
    data `Failure` (
        error => any ) );

const Started = data `Task.Started` ( );

Task.Completed = union `Task.Completed` (
    Task.Success,
    Task.Failure );

Task.Initial.update = update
    .on(Started, (initial, event) =>
    [
        Task.Running({ ...initial }),
        [Task.Running({ ...initial })]
    ])

Task.Running.update = update
    .on(Task.Success, (initial, event) =>
        [event, [event]])
    .on(Task.Failure, (waiting, event) =>
        [event, [event]]);

const TaskReturningSymbol = Symbol("@cause/task:task-returning");

Task.taskReturning = f => Object.assign(f, { [TaskReturningSymbol]: true });
Task.isTaskReturning = f => !!f[TaskReturningSymbol];

Task.fromAsync = function (fAsync)
{
    return Task.taskReturning((...args) =>
        Task.fromAsyncCall(null, fAsync, args));
}

Task.fromAsyncCall =
Task.fromResolvedCall = function (self, fUnknown, args = [])
{
    const start = function start (push)
    {
        // Even if f was known to be a Promise-returning function, it can still
        // throw during the initial calling phase and thus not be handled by
        // .catch.
        (async function ()
        {
            push(Started);

            if (process.env.TASK_DEBUG)
                console.log("IN HERE FOR " + fUnknown);

            push(Task.Success({ value: await fUnknown.apply(self, args) }));
        })().catch(error => push(Task.Failure({ error })));
    };

    start.toString = function () { return (fUnknown+"").substr(0,100); }
    start[inspect] = function () { return (fUnknown+"").substr(0,100); }
    const cause = Cause(any)({ start });

    return Task.Initial({ cause });
}

module.exports = Task;
module.exports.Task = Task;
