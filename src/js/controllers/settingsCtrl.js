var module = require('./_module_init.js');
module.controller('QJBackendSettingsController', function(
	$QJAuth, $QJCCombobox, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {
	$QJLogger.log("QJBackendSettingsController -> initialized");


	$scope.breadcrumb = {
		name: 'Settings',
		list: [
			//{name:'None2',state:'',fa:'fa-dashboard'}
		],
		active: "Settings"
	};

	function loadControls() {
		//combobox
		$QJCCombobox.create({
			name: 'configGroupCBO',
			label: "Grupo de implementacion",
			code: $scope.stats._group_id,
			//code_copyto: 'usersFilter.fields._usergroup_id',
			api: {
				controller: 'group',
				params: {
					action: 'combobox_assoc'
				}
			},
		}, $scope);
	}

	function onTokenUpdate(callback) {
		$QJApi.getController('user').get({
			action: 'current'
		}, function(res) {
			$QJLogger.log("HomeController -> user -> current  -> success");
			$scope.stats = res.user;
			//console.info(res);
			callback();
		});
	}
	$rootScope.$on('session.change', function() {
		onTokenUpdate(function() {});
	});
	onTokenUpdate(function() {
		loadControls();
	});


	$scope.$on('configGroupCBO.change', function(args1, args2) {
		if (args2.selectedValue !== -1 && args2.selectedValue !== $scope.stats._group_id) {
			console.info('changing impl');
			$QJApi.getController('auth').post({
				action: 'changegroup'
			}, {
				_group_id: args2.selectedValue
			}, function(res) {
				$QJLogger.log("HomeController -> auth -> changegroup  -> success");
				$QJAuth.updateSessionCustom(res.token, args2.selectedValue);
			});

		}
	});

});