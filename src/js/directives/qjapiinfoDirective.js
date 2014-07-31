var module = require('./_module_init.js');
//
module.directive('qjapiinfo', function() {
	var directive = {};
	directive.restrict = 'E'; /* restrict this directive to elements */
	directive.templateUrl = "pages/controls/qjapiinfo.html";
	directive.compile = function(element, attributes) {
		var linkFunction = function($scope, element, attributes) {}
		return linkFunction;
	}
	return directive;
});