var module = require('./_module_init.js');
module.controller('ProjectListController', function(
    $QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {

    $QJLogger.log("ProjectListController -> initialized");


    $scope.breadcrumb = {
        name: 'Projects',
        list: [
            //{name:'None2',state:'',fa:'fa-dashboard'}
        ],
        active: "Projects"
    };

    $scope.projects = []; //holds projects from db
    $scope.projectsData = null; //holds projects divided per page

    //filter
    $QJCFilter.create({
        name: 'projectsFilter',
        fields: [{
            name: 'name',
            arrayName: 'projects',
            bindTo: ['name']
        }, {
            name: 'description',
            arrayName: 'projects',
            bindTo: ['description']
        }, {
            name: '_id_company',
            arrayName: 'projects',
            bindTo: ['_id_company']
        }]
    }, $scope);


    function loadControls() {
        //combobox
        $QJCCombobox.create({
            name: 'companyCBO',
            label: "Company",
            code: -1, //$rootScope.currentUser._group_id,
            code_copyto: 'projectsFilter.fields._id_company',
            api: {
                controller: 'company',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
        //listview
        $QJCListview.create({
            name: 'projectsLVW',
            dataArray: 'projects',
            pagedDataArray: 'projectsData',
            api: {
                controller: 'project',
                params: {
                    action: 'all',
                    _id_company: -1
                }
            },
            columns: [{
                name: 'name',
                label: 'Name'
            }, {
                name: 'description',
                label: 'Description'
            }, {
                name: 'companyDescription',
                label: 'Company'
            }],
            itemClick: function(item) {
                $QJHelperFunctions.changeState('module-project-edit', {
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
        $scope.projectsFilter.filter();
    }, 2000);

})

module.controller('ProjectEditController', function(
    $QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {

    $QJLogger.log("ProjectEditController -> initialized");

    $scope.breadcrumb = {
        name: 'Project',
        list: [{
            name: 'Projects',
            state: 'module-project-list',
            //fa: 'fa-dashboard'
        }],
        active: 'Loading...'
    };


    var _project_id = $state.params.id;

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
        if (_.isUndefined($scope.item.name) || $scope.item.name == '') {
            hasErrors = showError('Name required');
        }
        /*
        if (_.isUndefined($scope.item.description) || $scope.item.description == '') {
            hasErrors = showError('First name required');
        }
        */
        if (_.isUndefined($scope.item._id_company) || $scope.item._id_company == '') {
            hasErrors = showError('Company required');
        }
        return hasErrors;
    }

    $scope.save = function() {
        if (!formHasErrors()) {
            $QJApi.getController('project').post({
                action: 'save'
            }, $scope.item, function(res) {
                $QJLogger.log("ProjectEditController -> -> project save -> success");
                //
                showError('Cambios guardados');
            });
        };
    };
    $scope.cancel = function() {
        $QJHelperFunctions.changeState('module-project-list');
    };
    $scope.delete = function() {
        var r = confirm("Delete " + $scope.item.name + " ?");
        if (r == true) {
            $QJApi.getController('project').post({
                action: 'delete'
            }, $scope.item, function(res) {
                $QJLogger.log("ProjectEditController -> project delete -> success");
                //
                showError('Cambios guardados');
                showError($scope.item.name + ' eliminado');

                $timeout(function() {
                    $QJHelperFunctions.changeState('module-project-list');
                }, 500);

                create();
            });
        } else {}
    }


    function create() {
        $QJLogger.log("ProjectEditController -> create new!");
        $scope.item = {
            name: '',
            description: '',
            _id_company: '',
            _id: -1
        };
    }

    function loadControls() {
        //combobox
        $QJCCombobox.create({
            name: 'companyCBO',
            label: "Company",
            code: $scope.item._id_company,
            code_copyto: 'item._id_company',
            api: {
                controller: 'company',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
    }

    if (_project_id == -1) {
        //CREATE
        create();
        loadControls();
    } else {
        //UPDATE
        $QJApi.getController('project').get({
            action: 'single',
            id: _project_id
        }, function(res) {
            $QJLogger.log("ProjectEditController -> project single -> success");
            console.info(res.item);
            $scope.item = res.item;

            $scope.breadcrumb.active = $scope.item.name;

            loadControls();
        });

    }

});


;