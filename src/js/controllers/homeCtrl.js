var module = require('./_module_init.js');
module.controller('HomeController', function(
	$QJAuth, $QJCCombobox, $QJLogger, $scope, $rootScope, $QJLoginModule, $QJLocalSession, $QJConfig, $QJApi) {
	$QJLogger.log("HomeController -> initialized");

	$scope.breadcrumb = {
		name: 'Dashboard',
		list: [
			//{name:"None1",state:'module-project-list',fa:'fa-dashboard'},
			//{name:'None2',state:'',fa:'fa-dashboard'}
		],
		active: "Dashboard"
	};


});