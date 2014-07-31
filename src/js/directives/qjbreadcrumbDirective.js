var module = require('./_module_init.js');
//
module.directive('qjbreadcrumb', function($QJHelperFunctions) {
	var directive = {};
	directive.restrict = 'E'; /* restrict this directive to elements */
	directive.templateUrl = "pages/module_directives/module.breadcrumb.directive.html";
	directive.scope = {
		data: "="
	}
	directive.compile = function(element, attributes) {
		var linkFunction = function($scope, element, attributes) {

			$scope.data.goto = function(item) {
				$QJHelperFunctions.changeState(item.state, item.params);
			};

		}
		return linkFunction;
	}
	return directive;
});