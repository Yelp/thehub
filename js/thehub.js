this.util = this.util || {};


/**
 * util.Mutex is the closest we're gonna get to a mutex in Javascript.
 */
util.Mutex = function() {
	this.queue = [];
};
util.Mutex.prototype = {
	isLocked: false,

	toString: function() {
		return 'util.Mutex[' + this.queue.length + ']';
	},

	/**
	 * Enqueue a callspec within this mutex. Calling this does not invoke
	 * processing of the enqueued specs.
	 * @param {Object} that 'this' for the function
	 * @param {Function} fun the function to call
	 * @param {String} fun the name of a function on the context object
	 * @param {Array} args arguments for the function
	 */
	enqueue: function(that, fun, args) {
		args = args || [];
		if (typeof fun === 'string') {
			fun = that[fun];
		}
		this.queue.push(new util.Mutex.FunctionSpec(that, fun, args));

		return this;
	},

	/**
	 * Process callspecs from the queue. If the queue is already processing,
	 * calling this function does nothing.
	 */
	process: function() {
		if (!this.isLocked) {
			this.isLocked = true;

			try {
				while (this.queue.length > 0) {
					try {
						this.queue.shift().apply();

					} catch (ex) {
						this.onException(ex, spec.that, spec.fun, spec.args);
					}
				}
			} finally {
				this.isLocked = false;
			}
		}
		return this;
	},

	/**
	 * Enqueue and process.
	 * @see enqueue
	 * @see process
	 */
	enter: function() {
		return this.enqueue.apply(this, arguments).process();
	},

	/** Handle an exception thrown when processing the queue. */
	onException: function(ex, that, fun, args) {}
};


util.Mutex.FunctionSpec = function(that, fun, args) {
	this.that = that;
	this.fun = fun;
	this.args = args;
};
util.Mutex.FunctionSpec.prototype = {
	apply: function() {
		return this.fun.apply(this.that, this.args);
	}
};


/**
 * @constructor
 */
util.Hub =  function() {
	this.subscriberMap = {};    // map of event ids to subscribers
	this.last = {};      // map of event ids to last published values
	this.mutex = new util.Mutex();
};
util.Hub.prototype = {
	toString: function() {
		return 'util.Hub';
	},

	/**
	 * return the list of subscribers
	 * @param {String} property the event property to list subscribers for
	 */
	subscribersFor: function(property) {
		var subscribers = this.subscriberMap[property];
		if (!subscribers) {
			subscribers = this.subscriberMap[property] = [];
		}
		return subscribers;
	},

	/**
	 * Register a function and context object on changes to a property.
	 * @param {String} property the name of the event to subscribe to
	 * @param {Function} fun the callback
	 * @param {Object} that context
	 * @return {Object} this
	 */
	subscribe: function(property, fun, that) {
		var subscribers = this.subscribersFor(property);
		var subscriber = new util.Hub.Subscriber(fun, that);
		if (!subscribers.some(subscriber.equals, subscriber)) {
			subscribers.push(subscriber);

			if (property in this.last) {
				this.mutex.enter(subscriber, 'call', [this.last[property]]);
			}
		}
		return this;
	},

	/**
	 * Unregister a function and context for a property's changes.
	 * @param {String} property the name of the event to subscribe to
	 * @param {Function} fun the callback
	 * @param {Object} that context
	 * @return {Object} this
	 */
	unsubscribe: function(property, fun, that) {
		var subscriber = new util.Hub.Subscriber(fun, that);
		this.subscriberMap[property] = this.subscribersFor(property).filter(subscriber.notEquals, subscriber);

		return this;
	},

	/**
	 * Set the last value for a property and enqueue subscriber calls in the mutex.
	 * @return {Object} this
	 */
	dispatch: function(property, value) {
		this.last[property] = value;

		this.subscribersFor(property).forEach(function(subscriber) {
			this.mutex.enqueue(subscriber, 'call', [value]);
		}, this);

		return this;
	},

	/**
	 * Publish a value.
	 * @param {String} property
	 * @param value
	 * @returns {Object} this
	 */
	publish: function(property, value) {
		this.dispatch(property, value);
		this.mutex.process();

		return this;
	},

	/**
	 * Publish multiple properties in an arbitrary order. All subscriber calls
	 * are enqueued together.
	 * @returns {Object} this
	 */
	publishMultiple: function(properties) {
		for (var property in properties) {
			var value = properties[property];
			this.dispatch(property, value);
		}
		this.mutex.process();

		return this;
	},

	/**
	 * Synchronously access the last value for a property.
	 * @return {Object} this
	 */
	getLast: function(property, def) {
		return (property in this.last) ? this.last[property] : def;
	}
};


/**
 *
 */
util.Hub.Subscriber = function(fun, that) {
	this.fun = fun;
	this.that = that;
};
util.Hub.Subscriber.prototype = {
	call: function(value) {
		return this.fun.call(this.that, value);
	},

	equals: function(other) {
		return other && this.fun === other.fun && this.that === other.that;
	},

	notEquals: function(other) {
		return !this.equals(other);
	}
};
