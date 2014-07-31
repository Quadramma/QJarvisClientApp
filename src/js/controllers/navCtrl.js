var module = require('./_module_init.js');
module.controller('NavController', function(
	$QJLogger, $QJHelperFunctions, $QJApi,
	$scope, $rootScope, $QJLoginModule, $QJLocalSession, $QJConfig) {
	$QJLogger.log("NavController -> initialized");

	//Siempre que entra al home recupera los datos del usuario actual y los setea globalmente en el rootScope.
	$QJApi.getController('user').get({
		action: 'current'
	}, function(res) {
		$QJLogger.log("HomeController -> user -> api get -> user single -> success");
		$rootScope.currentUser = res.user;
		$rootScope.session.user = res.user;
		$rootScope.$emit('currentUser.change');
		//console.info(res);



	});

	$scope.signout = function() {
		$rootScope.session.token = null;
		store.clear();
		$QJHelperFunctions.changeState('login');
		$QJLogger.log("NavController -> signout -> at " + new Date());
	}
});