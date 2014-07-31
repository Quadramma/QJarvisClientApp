var module = require('./_module_init.js');
module.controller('UserListController', function(
    $QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {



    $QJLogger.log("UserListController -> initialized");



    $scope.breadcrumb = {
        name: 'Users',
        list: [
            //{name:"None1",state:'module-project-list',fa:'fa-dashboard'},
            //{name:'None2',state:'',fa:'fa-dashboard'}
        ],
        active: "Users"
    };


    //console.info($rootScope.config);

    $scope.users = []; //holds users from db
    $scope.usersData = null; //holds users divided per page

    //filter
    $QJCFilter.create({
        name: 'usersFilter',
        fields: [{
            name: 'loginname',
            arrayName: 'users',
            bindTo: ['loginname']
        }, {
            name: 'text',
            arrayName: 'users',
            bindTo: ['first_name', 'last_name']
        }, {
            name: '_usergroup_id',
            arrayName: 'users',
            bindTo: ['_usergroup_id']
        }]
    }, $scope);

    /*
    //selectkey
    $QJCSelectkey.create({
        name: 'usersUsergroupSLK',
        label: "Usergroup",
        code: 7,
        text: "No disponible",
        code_copyto: 'usersFilter.fields._usergroup_id',
        search: function() {
            console.info('grupo de usuario lick')
        }
    }, $scope);
*/

    function loadControls() {


        //combobox
        $QJCCombobox.create({
            name: 'usersUsergroupCBO',
            label: "Usergroup",
            code: -1, //$rootScope.currentUser._group_id,
            code_copyto: 'usersFilter.fields._usergroup_id',
            api: {
                controller: 'usergroup',
                params: {
                    action: 'combobox'
                }
            },
        }, $scope);
        //listview
        $QJCListview.create({
            name: 'usersLVW',
            dataArray: 'users',
            pagedDataArray: 'usersData',
            api: {
                controller: 'user',
                params: {
                    action: 'all'
                }
            },
            columns: [{
                name: 'loginname',
                label: 'Username'
            }, {
                name: 'first_name',
                label: 'First name'
            }, {
                name: 'last_name',
                label: 'Last name'
            }],
            itemClick: function(item) {
                $QJHelperFunctions.changeState('module-user-edit', {
                    id: item._id
                });
            }
        }, $scope);
    }


    //Load controls when current user its avaliable.
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
        $scope.usersFilter.filter();
    }, 2000);
})



module.controller('UserEditController', function(
    $QJCCombobox, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {
    $QJLogger.log("UserEditController -> initialized");


    $scope.breadcrumb = {
        name: 'User',
        list: [{
            name: "Users",
            state: 'module-user-list',
            //fa: 'fa-dashboard'
        }, ],
        active: 'Loading...'
    };


    var _user_id = $state.params.id;

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
        if (_.isUndefined($scope.item.loginname) || $scope.item.loginname == '') {
            hasErrors = showError('Username required');
        }
        if (_.isUndefined($scope.item.first_name) || $scope.item.first_name == '') {
            hasErrors = showError('First name required');
        }
        if (_.isUndefined($scope.item.last_name) || $scope.item.last_name == '') {
            hasErrors = showError('Last name required');
        }
        if (_.isUndefined($scope.item._usergroup_id) || $scope.item._usergroup_id == '') {
            hasErrors = showError('Usergroup required');
        }
        return hasErrors;
    }

    $scope.save = function() {
        if (!formHasErrors()) {
            //console.info('Salvando!');
            $QJApi.getController('user').post({
                action: 'save'
            }, $scope.item, function(res) {
                $QJLogger.log("UserEditController -> user -> api post -> user save -> success");
                //
                showError('Cambios guardados');
            });
        };
    };
    $scope.cancel = function() {
        $QJHelperFunctions.changeState('module-user-list');
    };
    $scope.delete = function() {
        var r = confirm("Delete " + $scope.item.loginname + " ?");
        if (r == true) {
            $QJApi.getController('user').post({
                action: 'delete'
            }, $scope.item, function(res) {
                $QJLogger.log("UserEditController -> user -> api post -> user delete -> success");
                //
                showError('Cambios guardados');
                showError($scope.item.loginname + ' eliminado');
                create();
            });
        } else {}
    }


    function create() {
        $scope.item = {
            loginname: '',
            first_name: '',
            last_name: '',
            password: '',
            _usergroup_id: $scope.item._usergroup_id || '',
            _id: -1
        };
    }

    function loadControls() {

        //combobox only items who user has access
        $QJCCombobox.create({
            name: 'userEditUsergroupAccessCBO',
            label: "Usergroup",
            code: $scope.item._usergroup_id,
            disabled:true,
            code_copyto: 'item._usergroup_id',
            api: {
                controller: 'usergroup',
                params: {
                    action: 'combobox_access'
                }
            },
        }, $scope);


        //combobox
        $QJCCombobox.create({
            name: 'userEditUsergroupCBO',
            label: "Usergroup",
            code: $scope.item._usergroup_id,
            code_copyto: 'item._usergroup_id',
            api: {
                controller: 'usergroup',
                params: {
                    action: 'combobox'
                }
            },
        }, $scope);
    }

    if (_user_id == -1) {
        //CREATE
        create();
        loadControls();
    } else {
        //UPDATE
        $QJApi.getController('user').get({
            action: 'single',
            id: _user_id
        }, function(res) {
            $QJLogger.log("UserEditController -> user -> api get -> user single -> success");
            $scope.item = res.user;
            $scope.breadcrumb.active = $scope.item.loginname;
            loadControls();
        });

    }



});


;