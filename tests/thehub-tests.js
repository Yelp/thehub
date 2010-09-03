//
// Mutex
//


module('Mutex');


test('basic', function() {
	expect(3);

	var mutex = new util.Mutex();

	ok(mutex, 'initialized');
	same(mutex.queue, [], 'mutex.queue');
	ok(!mutex.isLocked, 'mutex.isLocked');
});


test('function spec', function() {
	expect(4);

	var spec = new util.Mutex.FunctionSpec({}, function() {
		ok(true, 'spec.apply');
	}, []);
	ok(spec.that, 'spec.that');
	ok(spec.fun, 'spec.fun');
	ok(spec.args, 'spec.args');
	spec.apply();
});


test('enqueue', function() {
	expect(2);

	var mutex = new util.Mutex();

	mutex.enqueue(null, function() {});
	same(mutex.queue.length, 1, 'mutex.queue.length');
	mutex.enqueue(null, function() {});
	same(mutex.queue.length, 2, 'mutex.queue.length');
});


test('process', function() {
	expect(21);

	var mutex = new util.Mutex();

	for (var i = 0; i < 10; ++i) {
		mutex.enqueue(null, function() {
			ok(true, 'mutex.process');
		});
		same(mutex.queue.length, i + 1, 'mutex.queue.length');
	}

	mutex.process();
	same(mutex.queue.length, 0, 'mutex.queue.length');
});

test('recursive enqueue', function() {
	expect(5);

	var mutex = new util.Mutex();

	var count = 0;
	var funs = [1, 2, 3, 4, 5].map(function(i) {
		return function() {
			count++;
			same(count, i, 'process');
			if (funs[i]) {
				mutex.enter(null, funs[i]);
			}
		};
	});
	mutex.enter(null, funs[0]);
});


test('process execution order', function() {
	expect(1);

	var mutex = new util.Mutex();

	var calls = [];

	[1, 2, 3].forEach(function(i) {
		mutex.enqueue(null, function() {
			calls.push(i);
			[1, 2, 3].forEach(function(j) {
				mutex.enter(null, function() {
					calls.push([i, j]);
				});
			});
		});
	});

	mutex.process();

	same(calls, [1, 2, 3, [1, 1], [1, 2], [1, 3], [2, 1], [2, 2], [2, 3], [3, 1], [3, 2], [3, 3]], 'calls');
});


//
// Hub
//


module('Hub');

test('basic', function() {
	expect(5);

	var hub = new util.Hub();

	ok(hub, 'initialized');
	ok(hub.mutex, 'hub.mutex');
	same(hub.subscriberMap, {}, 'hub.subscriberMap');
	same(hub.subscribersFor('test'), [], 'hub.subscribersFor');
	same(hub.subscriberMap, {'test': []}, 'hub.subscriberMap');
});


test('publish', function() {
	expect(1);

	var hub = new util.Hub();

	hub.publish('test', true);
	ok(hub.getLast('test'), 'hub.getLast');
});


test('subscribe', function() {
	expect(1);

	var hub = new util.Hub();

	hub.subscribe('test', function(test) {});
	same(hub.subscribersFor('test').length, 1, 'hub.subscribersFor(test).length');
});


test('publish then subscribe', function() {
	expect(1);

	var hub = new util.Hub();

	hub.publish('test', true);
	hub.subscribe('test', function(test) {
		ok(test, 'subscribe after publish');
	});
});


test('subscribe then publish', function() {
	expect(1);

	var hub = new util.Hub();

	hub.subscribe('test', function(test) {
		ok(test, 'subscribe after publish');
	});
	hub.publish('test', true);
});

test('unsubscribe', function() {
	expect(2);

	var hub = new util.Hub();

	var callback = function(test) {};
	hub.subscribe('test', callback);
	same(hub.subscribersFor('test').length, 1, 'subscribers.length');
	hub.publish('test', true);
	hub.unsubscribe('test', callback);
	same(hub.subscribersFor('test').length, 0, 'subscribers.length');
});

test('subscriber', function() {
	expect(7);

	var fun = function(value) {
		ok(value, 'subscriber.call');
	};
	var that = {};

	var subscriber1 = new util.Hub.Subscriber(fun, that);
	var subscriber2 = new util.Hub.Subscriber(fun, that);
	var subscriber3 = new util.Hub.Subscriber(function() {});

	ok(subscriber1.equals(subscriber2), 'equals');
	ok(subscriber2.equals(subscriber1), 'equals');
	ok(!subscriber1.equals(subscriber3), 'equals');
	ok(subscriber1.notEquals(subscriber3), 'notEquals');
	ok(subscriber3.notEquals(subscriber2), 'notEquals');
	subscriber1.call(true);
	subscriber2.call(true);
});

test('publish multiple', function() {
	expect(3);

	var hub = new util.Hub();

	var values = [1, 2, 3];
	var properties = {};
	values.forEach(function(i) {
		properties[String(i)] = i;
	});

	hub.publishMultiple(properties);
	values.forEach(function(i) {
		same(hub.getLast(String(i)), i, 'getLast');
	});
});
