var module = require('./_module_init.js');
module.controller('UsergroupListController', function(
	$QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {

	$QJLogger.log("UsergroupListController -> initialized");
	$scope.breadcrumb = {
		name: 'Usergroups',
		list: [],
		active: "Usergroups"
	};
	$scope.items = []; //holds items from db
	$scope.lvwData = null; //holds items divided per page

	//filter
	$QJCFilter.create({
		name: 'filter',
		fields: [{
			name: 'description',
			arrayName: 'items',
			bindTo: ['description']
		}, {
			name: '_id_profile',
			arrayName: 'items',
			bindTo: ['_id_profile']
		}]
	}, $scope);

	function loadControls() {
		//combobox
		$QJCCombobox.create({
			name: 'profileCBO',
			label: "Profile",
			code: -1,
			code_copyto: 'filter.fields._id_profile',
			api: {
				controller: 'profile',
				params: {
					action: 'combobox_all'
				}
			},
		}, $scope);
		//listview
		$QJCListview.create({
			name: 'lvw',
			dataArray: 'items',
			pagedDataArray: 'lvwData',
			api: {
				controller: 'usergroup',
				params: {
					action: 'lvwdata'
				}
			},
			columns: [{
				name: 'description',
				label: 'Description'
			}, {
				name: 'profileDescription',
				label: 'Profile'
			}],
			itemClick: function(item) {
				$QJHelperFunctions.changeState('module-usergroup-edit', {
					id: item._id
				});
			}
		}, $scope);
	}


	//Load controls when current item its avaliable.
	var controlsLoaded = false;
	$rootScope.$on('currentUser.change', function() {
		loadControls();
		controlsLoaded = true;
	});
	if (!controlsLoaded && !_.isUndefined($rootScope.currentUser)) {
		loadControls();
		controlsLoaded = true;
	}
	//defaults
	$timeout(function() {
		$scope.filter.filter();
	}, 2000);
})

module.controller('UsergroupEditController', function(
	$QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {

	$QJLogger.log("UsergroupEditController -> initialized");
	$scope.breadcrumb = {
		name: 'Usergroup Edit',
		list: [{
			name: "Usergroups",
			state: 'module-usergroup-list',
			//fa: 'fa-dashboard'
		}, ],
		active: "Loading..."
	};



	var _id = $state.params.id;

	$scope.crud = {
		errors: []
	}

	function showError(error) {
		$scope.crud.errors.push(error);
		return true;
	}

	function formHasErrors() {
		$scope.crud.errors = [];
		var hasErrors = false;
		if (_.isUndefined($scope.item.description) || $scope.item.description == '') {
			hasErrors = showError('Description required');
		}
		if (_.isUndefined($scope.item._id_profile) || $scope.item._id_profile == '') {
			hasErrors = showError('Profile required');
		}
		return hasErrors;
	}

	$scope.save = function() {
		if (!formHasErrors()) {
			$QJApi.getController('usergroup').post({
				action: 'save'
			}, $scope.item, function(res) {
				$QJLogger.log("UsergroupEditController -> api post -> save -> success");
				//
				showError('Cambios guardados');
				$QJHelperFunctions.changeState('module-usergroup-list', {}, 500);
			});
		};
	};
	$scope.delete = function() {
		var r = confirm("Delete " + $scope.item.name + " ?");
		if (r == true) {
			$QJApi.getController('usergroup').post({
				action: 'delete'
			}, $scope.item, function(res) {
				$QJLogger.log("UsergroupEditController -> delete -> success");
				//
				showError('Cambios guardados');
				showError($scope.item.description + ' eliminado');
				//
				$QJHelperFunctions.changeState('module-usergroup-list', {}, 500);

				create();
			});
		} else {}
	}
	$scope.cancel = function() {
		$QJHelperFunctions.changeState('module-usergroup-list');
	};

	function loadControls() {

		//combobox
		$QJCCombobox.create({
			name: 'profileCBO',
			label: "Profile",
			code: $scope.item._id_profile,
			code_copyto: 'item._id_profile',
			api: {
				controller: 'profile',
				params: {
					action: 'combobox_all'
				}
			},
		}, $scope);

	}

	function create() {
		$QJLogger.log("UsergroupEditController -> create new!");
		$scope.item = {
			description: '',
			_id_profile: '',
			_id: -1
		};
	}
	if (_id == -1) {
		//CREATE
		create();
		loadControls();
	} else {
		//GET SINGLE USER
		$QJApi.getController('usergroup').get({
			action: 'single',
			id: _id
		}, function(res) {
			$QJLogger.log("UsergroupEditController -> api get -> single -> success");
			$scope.item = res.item;
			$scope.breadcrumb.active = $scope.item.description;
			loadControls();
		});
	}

});

;