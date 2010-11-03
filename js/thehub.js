/** @namespace util */
this.util = this.util || {};


/**
 * util.Mutex is the closest we're gonna get to a mutex in Javascript.
 */
util.Mutex = function() {
    this.queue = [];
};

/** Whether the mutex is locked */
util.Mutex.prototype.isLocked = false;

util.Mutex.prototype.toString = function() {
    return 'util.Mutex[' + this.queue.length + ']';
};

/**
 * Enqueue a callspec within this mutex. Calling this does not invoke
 * processing of the enqueued specs.
 * @param {Object} context 'this' for the function
 * @param {Function} fun the function to call
 * @param {String} fun the name of a function on the context object
 * @param {Array} args arguments for the function
 */
util.Mutex.prototype.enqueue = function(context, fun, args) {
    args = args || [];
    if (typeof fun === 'string') {
        fun = context[fun];
    }
    this.queue.push(new util.Mutex.FunctionSpec(context, fun, args));
    return this;
};

/**
 * Process callspecs from the queue. If the queue is already processing,
 * calling this function does nothing.
 */
util.Mutex.prototype.process = function() {
    if (!this.isLocked) {
        this.isLocked = true;
        try {
            while (this.queue.length > 0) {
                var spec = this.queue.shift();
                try {
                    spec.apply();
                } catch (ex) {
                    this.onException(ex, spec.context, spec.fun, spec.args);
                }
            }
        } finally {
            this.isLocked = false;
        }
    }
    return this;
};

/**
 * Enqueue and process.
 * @see enqueue
 * @see process
 */
util.Mutex.prototype.enter = function() {
    return this.enqueue.apply(this, arguments).process();
};

/** Handle an exception thrown when processing the queue. */
util.Mutex.prototype.onException = function(ex, context, fun, args) {};


/** FunctionSpec represents all the objects required for a function apply call. */
util.Mutex.FunctionSpec = function(context, fun, args) {
    this.context = context;
    this.fun = fun;
    this.args = args;
};

/** Apply a function spec. */
util.Mutex.FunctionSpec.prototype.apply = function() {
    return this.fun.apply(this.context, this.args);
};


/**
 * Construct a new Hub.
 * @constructor
 */
util.Hub =  function() {
    this.subscriberMap = {};    // map of event ids to subscribers
    this.last = {};      // map of event ids to last published values
    this.mutex = new util.Mutex();
};

util.Hub.prototype.toString = function() {
    return 'util.Hub';
};

/**
 * return the list of subscribers
 * @param {String} property the event property to list subscribers for
 */
util.Hub.prototype.subscribersFor = function(property) {
    var subscribers = this.subscriberMap[property];
    if (!subscribers) {
        subscribers = this.subscriberMap[property] = [];
    }
    return subscribers;
};

/**
 * Register a function and context object on changes to a property.
 * @param {String} property the name of the event to subscribe to
 * @param {Function} fun the callback
 * @param {Object} context object
 * @return {Object} this
 */
util.Hub.prototype.subscribe = function(property, fun, context) {
    var subscribers = this.subscribersFor(property);
    var newSubscriber = new util.Hub.Subscriber(fun, context);
    if (!subscribers.some(function(subscriber) { return subscriber === newSubscriber; })) {
        subscribers.push(newSubscriber);
        if (property in this.last) {
            this.mutex.enter(newSubscriber, 'call', [this.last[property]]);
        }
    }
    return this;
};

/**
 * Unregister a function and context for a property's changes.
 * @param {String} property the name of the event to subscribe to
 * @param {Function} fun the callback
 * @param {Object} context object
 * @return {Object} this
 */
util.Hub.prototype.unsubscribe = function(property, fun, context) {
    var oldSubscriber = new util.Hub.Subscriber(fun, context);
    this.subscriberMap[property] = this.subscribersFor(property).filter(function(subscriber) {
		return subscriber !== oldSubscriber;
    });
    return this;
};

/**
 * Set the last value for a property and enqueue subscriber calls in the mutex.
 * @return {Object} this
 */
util.Hub.prototype.dispatch = function(property, value) {
    this.last[property] = value;
    this.subscribersFor(property).forEach(function(subscriber) {
        this.mutex.enqueue(subscriber, 'call', [value]);
    }, this);
    return this;
};

/**
 * Publish a value.
 * @param {String} property
 * @param value
 * @returns {Object} this
 */
util.Hub.prototype.publish = function(property, value) {
    this.dispatch(property, value);
    this.mutex.process();
    return this;
};

/**
 * Publish multiple properties in an arbitrary order. All subscriber calls
 * are enqueued together.
 * @returns {Object} this
 */
util.Hub.prototype.publishMultiple = function(properties) {
    for (var property in properties) {
        var value = properties[property];
        this.dispatch(property, value);
    }
    this.mutex.process();
    return this;
};

/**
 * Synchronously access the last value for a property.
 * @return {Object} this
 */
util.Hub.prototype.getLast = function(property, def) {
    return (property in this.last) ? this.last[property] : def;
};


/**
 * An object to represent an combination of a function and context object.
 */
util.Hub.Subscriber = function(fun, context) {
    this.fun = fun;
    this.context = context;

	var funStr = fun.toString();
	var bucket = this.interned[funStr];
	if (bucket) {
		var current = null;
		var equals = function(subscriber) {
			current = subscriber;
			return (this.fun === subscriber.fun) && (this.context === subscriber.context);
		};
		if (bucket.some(equals, this)) {
			return current;
		}
	} else {
		this.interned[funStr] = bucket = [];
	}
	bucket.push(this);
};

util.Hub.Subscriber.prototype.interned = {};

util.Hub.Subscriber.prototype.call = function(value) {
    return this.fun.call(this.context, value);
};
