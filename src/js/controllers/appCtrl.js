var module = require('./_module_init.js');
module.controller('AppController', function(
	$QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {
	$QJLogger.log("AppController -> initialized");
	//$QJHelperFunctions.checkAPIAndGoToApiErrorStateIfThereIsAProblem();
	$QJHelperFunctions.checkTokenExpirationAndGoToLoginStateIfHasExpired();
});