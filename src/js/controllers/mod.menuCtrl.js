var module = require('./_module_init.js');
module.controller('MenuListController', function(
    $QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {
    $QJLogger.log("MenuListController -> initialized");



    $scope.breadcrumb = {
        name: 'Menu Editor',
        list: [
            //{name:"None1",state:'module-project-list',fa:'fa-dashboard'},
            //{name:'None2',state:'',fa:'fa-dashboard'}
        ],
        active: "Menu Editor"
    };

    $scope.menuArr = []; //holds items from db
    $scope.menuData = null; //holds items divided per page

    //filter
    $QJCFilter.create({
        name: 'menuFilter',
        fields: [{
            name: 'description',
            arrayName: 'menuArr',
            bindTo: ['description']
        }, {
            name: '_profile_id',
            arrayName: 'menuArr',
            bindTo: ['_profile_id']
        }, {
            name: '_group_id',
            arrayName: 'menuArr',
            bindTo: ['_group_id']
        }]
    }, $scope);

    function loadControls() {
        //combobox
        $QJCCombobox.create({
            name: 'profileCBO',
            label: "Profile",
            code: -1,
            code_copyto: 'menuFilter.fields._profile_id',
            api: {
                controller: 'profile',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
        //combobox
        $QJCCombobox.create({
            name: 'groupCBO',
            label: "Implementation group",
            code: -1,
            code_copyto: 'menuFilter.fields._group_id',
            api: {
                controller: 'group',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
        //listview
        $QJCListview.create({
            name: 'menuLVW',
            dataArray: 'menuArr',
            pagedDataArray: 'menuData',
            api: {
                controller: 'menu',
                params: {
                    action: 'combobox_all'
                }
            },
            columns: [{
                    name: 'description',
                    label: 'Description'
                }
                //{name:'first_name',label:'First name'},
                //{name:'_profile_id',label:'Last name'}
            ],
            itemClick: function(item) {
                $QJHelperFunctions.changeState('module-menu-edit', {
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
        $scope.menuFilter.filter();
    }, 2000);
})



module.controller('MenuEditController', function(
    $QJCCombobox, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {
    $QJLogger.log("MenuEditController -> initialized");

    var _menu_id = $state.params.id;

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
        if (_.isUndefined($scope.item._group_id) || $scope.item._group_id == '') {
            hasErrors = showError('Group required');
        }
        if (_.isUndefined($scope.item._profile_id) || $scope.item._profile_id == '') {
            hasErrors = showError('Profile required');
        }
        return hasErrors;
    }

    $scope.save = function() {
        if (!formHasErrors()) {
            $QJApi.getController('menu').post({
                action: 'save'
            }, $scope.item, function(res) {
                $QJLogger.log("MenuEditController -> api post -> menu save -> success");
                //
                showError('Cambios guardados');
            });
        };
    };
    $scope.cancel = function() {
        $QJHelperFunctions.changeState('module-menu-list');
    };


    function loadControls() {
        //combobox
        $QJCCombobox.create({
            name: 'groupCBO',
            label: "Implementation group",
            code: $scope.item._group_id,
            code_copyto: 'item._group_id',
            api: {
                controller: 'group',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
        //combobox
        $QJCCombobox.create({
            name: 'profileCBO',
            label: "Profile",
            code: $scope.item._profile_id,
            code_copyto: 'item._profile_id',
            api: {
                controller: 'profile',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
    }



    //GET SINGLE USER
    $QJApi.getController('menu').get({
        action: 'single',
        id: _menu_id
    }, function(res) {
        $QJLogger.log("MenuEditController -> api get -> menu single -> success");
        $scope.item = res.items[0] || null;
        loadControls();
    });


});


;