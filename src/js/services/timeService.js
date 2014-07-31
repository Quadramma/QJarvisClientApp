var module = require('./_module_init.js');
module.factory('$QJTime', [
	'$rootScope', '$state', '$timeout',
	function($rootScope, $state, $timeout) {
		var self = {};
		self.getTimestampDuration = function(timestamp) {
			var duration = {
				hours: Math.round(Math.floor(timestamp / 1000 / 60 / 60) % 24),
				minutes: Math.round(Math.floor(timestamp / 1000 / 60) % 60),
				seconds: Math.round(Math.floor(timestamp / 1000) % 60)
			};
			var str = "";
			str += duration.hours + ":";
			str += duration.minutes + ":";
			str += duration.seconds + "";
			return str;
		};
		return self;
	}
]);