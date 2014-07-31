var module = require('./_module_init.js');
module.controller('ProfileListController', function(
	$QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {

	$QJLogger.log("ProfileListController -> initialized");
	$scope.breadcrumb = {
		name: 'Profiles',
		list: [],
		active: "Profiles"
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
		}]
	}, $scope);

	function loadControls() {
		//listview
		$QJCListview.create({
			name: 'lvw',
			dataArray: 'items',
			pagedDataArray: 'lvwData',
			api: {
				controller: 'profile',
				params: {
					action: 'combobox_all'
				}
			},
			columns: [{
				name: 'description',
				label: 'Description'
			}],
			itemClick: function(item) {
				$QJHelperFunctions.changeState('module-profile-edit', {
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

module.controller('ProfileEditController', function(
	$QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {

	$QJLogger.log("ProfileEditController -> initialized");
	$scope.breadcrumb = {
		name: 'Profile Edit',
		list: [{
			name: "Profiles",
			state: 'module-profile-list',
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
		return hasErrors;
	}

	$scope.save = function() {
		if (!formHasErrors()) {
			$QJApi.getController('profile').post({
				action: 'save'
			}, $scope.item, function(res) {
				$QJLogger.log("ProfileEditController -> api post -> save -> success");
				//
				showError('Cambios guardados');
				$QJHelperFunctions.changeState('module-profile-list',{},500);
			});
		};
	};
	$scope.delete = function() {
		var r = confirm("Delete " + $scope.item.name + " ?");
		if (r == true) {
			$QJApi.getController('profile').post({
				action: 'delete'
			}, $scope.item, function(res) {
				$QJLogger.log("ProfileEditController -> delete -> success");
				//
				showError('Cambios guardados');
				showError($scope.item.description + ' eliminado');
				//
				$QJHelperFunctions.changeState('module-profile-list',{},500);

				create();
			});
		} else {}
	}
	$scope.cancel = function() {
		$QJHelperFunctions.changeState('module-profile-list');
	};

	function loadControls() {}

	function create() {
		$QJLogger.log("ProfileEditController -> create new!");
		$scope.item = {
			description: '',
			_id: -1
		};
	}
	if (_id == -1) {
		//CREATE
		create();
		loadControls();
	} else {
		//GET SINGLE USER
		$QJApi.getController('profile').get({
			action: 'single',
			id: _id
		}, function(res) {
			$QJLogger.log("ProfileEditController -> api get -> single -> success");
			$scope.item = res.item;
			$scope.breadcrumb.active = $scope.item.description;
			loadControls();
		});
	}

});

;