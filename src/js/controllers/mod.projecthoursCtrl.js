var module = require('./_module_init.js');
module.controller('ProjectHoursListController', function(
    $QJLocalSession, $QJCTimeCounter, $interval, $QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {
    $QJLogger.log("ProjectListController -> initialized");


    $scope.breadcrumb = {
        name: 'Projects Hours',
        list: [{
            name: 'Projects',
            state: 'module-project-list',
            //fa: 'fa-dashboard'
        }],
        active: "Projects Hours"
    };


    g.ProjectListController = $scope;

    $scope.items = []; //holds projects from db
    $scope.itemsData = null; //holds projects divided per page

    //filter
    $QJCFilter.create({
        name: 'projecthoursFilter',
        fields: [{
            name: 'loginname',
            arrayName: 'items',
            bindTo: ['loginname']
        }, {
            name: '_id_company',
            arrayName: 'items',
            bindTo: ['_id_company']
        }, {
            name: '_id_project',
            arrayName: 'items',
            bindTo: ['_id_project']
        }, {
            name: '_id_user',
            arrayName: 'items',
            bindTo: ['_id_user']
        }]
    }, $scope);


    function loadControls() {

        //--------
        //combobox
        $QJCCombobox.create({
            name: 'hourscompanyCBO',
            label: "Company",
            code: $rootScope.session.projecthours_hourscompanyCBOCODE || -1, //$rootScope.currentUser._group_id,
            code_copyto: 'hoursprojectCBO.api.params._id_company',
            //description_copyto: 'current.company',
            api: {
                controller: 'company',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
        //combobox
        $QJCCombobox.create({
            name: 'hoursprojectCBO',
            label: "Project",
            code: $rootScope.session.projecthours_hoursprojectCBOCODE || -1, //$rootScope.currentUser._group_id,
            code_copyto: 'current.item._id_project',
            description_copyto: 'current.project',
            api: {
                controller: 'project',
                params: {
                    action: 'combobox_all',
                    _id_company: $scope.hourscompanyCBO.code || -1
                }
            },
        }, $scope)
        //--------


        //combobox
        $QJCCombobox.create({
            name: 'companyCBO',
            label: "Company",
            code: -1, //$rootScope.currentUser._group_id,
            code_copyto: 'projecthoursFilter.fields._id_company',
            api: {
                controller: 'company',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
        //combobox
        $QJCCombobox.create({
            name: 'projectCBO',
            label: "Project",
            code: -1, //$rootScope.currentUser._group_id,
            code_copyto: 'projecthoursFilter.fields._id_project',
            api: {
                controller: 'project',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
        //combobox
        $QJCCombobox.create({
            name: 'userCBO',
            label: "User",
            code: -1, //$rootScope.currentUser._group_id,
            code_copyto: 'projecthoursFilter.fields._id_user',
            api: {
                controller: 'user',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);



        //listview
        $QJCListview.create({
            name: 'projectshoursLVW',
            dataArray: 'items',
            pagedDataArray: 'itemsData',
            api: {
                controller: 'project',
                params: {
                    action: 'hours_all',
                    _id_project: -1
                }
            },
            columns: [{
                name: 'loginname',
                label: 'User'
            }, {
                name: 'differenceFormated',
                label: 'Tiempo (hms)'
            }, {
                name: 'startFormated',
                label: 'Start'
            }, {
                name: 'endFormated',
                label: 'End'
            }],
            itemClick: function(item) {
                $QJHelperFunctions.changeState('module-project-hours-edit', {
                    id: item._id
                });
            }
        }, $scope);

        $scope.$on("projectshoursLVW.update", function() {
            //console.info("projectshoursLVW.update");
            $scope.items = _.each($scope.items, function(item) {
                var diff = item.difference;
                var duration = {
                    hours: Math.round((diff / 1000 / 60 / 60) % 24),
                    minutes: Math.round((diff / 1000 / 60) % 60),
                    seconds: Math.round((diff / 1000) % 60)
                };
                var str = "";
                str += duration.hours + ":";
                str += duration.minutes + ":";
                str += duration.seconds + "";
                item.differenceFormated = str;
                item.startFormated = moment(parseInt(item.start)).format("DD-MM-YY h:mm:ss a");
                item.endFormated = moment(parseInt(item.end)).format("DD-MM-YY h:mm:ss a");
            });
            //$QJLogger.log("projectshoursLVW.update");
        });



    }



    $QJCTimeCounter.create({
        name: 'current',
        api: {
            controller: 'project',
            params: {
                action: 'hours_current',
                _id_project: -1
            }
        },
        onInit: function(self) {
            if (_.isUndefined(self.resitem) || _.isNull(self.resitem)) {
                self.item = {
                    _id: -1,
                    _id_project: $scope.hoursprojectCBO.code,
                    _id_user: null, //save current based on token.
                    start: null,
                    end: null,
                    difference: null
                };
            } else {
                self.item = self.resitem;
                self.resume(self.item.start);
            }
        },
        onStartChange: function(newVal, self) {
            self.item.start = newVal;
        },
        onStopChange: function(newVal, self) {
            self.item.end = newVal;
        },
        onDiffChange: function(newVal, newValFormated, self) {
            self.item.difference = newVal;
        },
        onValidateStart: function(self) {
            var val = !_.isUndefined(self.item) && !_.isUndefined(self.item._id_project) && self.item._id_project != null && self.item._id_project != "";
            if (!val) {
                self.errors = [];
                self.addError("Project required");
            }
            return val;
        },
        onStartClick: function(self) {
            $scope.hourscompanyCBO.disabled = true;
            $scope.hoursprojectCBO.disabled = true;
            //
            $QJApi.getController("project").post({
                action: 'hours_save'
            }, self.item, function(res) {
                $QJLogger.log("hours -> save -> success");
            });
        },
        onStopClick: function(self) {
            $scope.hourscompanyCBO.disabled = false;
            $scope.hoursprojectCBO.disabled = false;
            //
            $QJApi.getController("project").post({
                action: 'hours_save'
            }, self.item, function(res) {
                $QJLogger.log("hours -> save -> success");
                self.addError("Duration: " + $QJHelperFunctions.getTimestampDuration(self.item.difference));
                self.addError("Timestamp saved");
                $scope.projectshoursLVW.update();
                $scope.$emit('project.update', {
                    initializeTimer: false
                });
            });
            //

            if ($scope.projectinfo) {
                $scope.projectinfo.show = false;
            }
        }
    }, $scope); //.init();
    $scope.$on('hoursprojectCBO.change', function() {
        $scope.$emit('project.update', {
            initializeTimer: true
        });
    });

    $scope.$on('project.update', function(arg, params) {

        //stores company,project
        $rootScope.session.projecthours_hourscompanyCBOCODE = $scope.hourscompanyCBO.code;
        $rootScope.session.projecthours_hoursprojectCBOCODE = $scope.hoursprojectCBO.code;
        $QJLocalSession.save();


        var _id_project = $scope.hoursprojectCBO.code; //UPDATE INFORMATION ABOUT PROJECT HOURS
        if (_id_project != -1) {
            updateProjectInfo(_id_project);

            if (params.initializeTimer) {
                $scope.current.api.params._id_project = _id_project; //ifa prj its selected. Update timer status
                $scope.current.init();
            }
        }

    });

    function updateProjectInfo(_id_project) {
        $QJApi.getController("project").get({
            action: "hours_all",
            _id_project: _id_project.toString()
        }, function(res) {
            $QJLogger.log("project hours_all -> success");
            var hours = [];
            _.each(res.items, function(item) {
                var exists = !_.isUndefined(_.find(hours, function(infoItem) {
                    return infoItem.loginname == item.loginname;
                }));

                if (item.end == null) exists = true; //
                if (exists) return;
                var hoursfrom = _.filter(res.items, function(i) {
                    return i.loginname == item.loginname;
                });
                var diff = 0;
                _.each(hoursfrom, function(i) {
                    diff += parseInt(i.difference);
                });

                hours.push({
                    loginname: item.loginname,
                    diff: diff,
                    diffFormated: $QJHelperFunctions.getTimestampDuration(diff)
                });
            });
            //console.info(info);
            var hoursTotal = 0;
            _.each(hours, function(i) {
                hoursTotal += parseInt(i.diff);
            });
            $scope.projectinfo = {
                hours: hours,
                hoursTotal: hoursTotal,
                hoursTotalFormated: $QJHelperFunctions.getTimestampDuration(hoursTotal),
                show: true
            };
            //console.info($scope.projectinfo);
        });
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
        $scope.projecthoursFilter.filter();
    }, 2000);


    scope = $scope;

})



module.controller('ProjectHoursEditController', function(
    $QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {


    $QJLogger.log("ProjectHoursEditController -> initialized");


    $scope.breadcrumb = {
        name: 'Project Hours',
        list: [{
            name: 'Projects Hours',
            state: 'module-project-hours-list',
            //fa: 'fa-dashboard'
        }],
        active: "Loading"
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
        if (_.isUndefined($scope.item.start) || $scope.item.start == '') {
            hasErrors = showError('Start required');
        }
        if (_.isUndefined($scope.item.end) || $scope.item.end == '') {
            hasErrors = showError('End required');
        }
        return hasErrors;
    }

    $scope.save = function() {
        if (!formHasErrors()) {
            $QJApi.getController('project').post({
                action: 'hours_save'
            }, $scope.item, function(res) {
                $QJLogger.log("ProjectHoursEditController -> -> project hours_save -> success");
                //
                showError('Cambios guardados');
            });
        };
    };
    $scope.cancel = function() {
        $QJHelperFunctions.changeState('module-project-hours-list');
    };
    $scope.delete = function() {
        var r = confirm("Delete [" + $scope.item.start + " - " + $scope.item.end + "] ?");
        if (r == true) {
            $QJApi.getController('project').post({
                action: 'hours_delete'
            }, $scope.item, function(res) {
                $QJLogger.log("ProjectHoursEditController -> project delete -> success");
                //
                showError('Cambios guardados');
                showError($scope.item.name + ' eliminado');

                $timeout(function() {
                    $QJHelperFunctions.changeState('module-project-hours-list');
                }, 500);

            });
        } else {}
    }


    function create() {
        $QJLogger.log("ProjectHoursEditController -> create new!");
        $scope.item = {
            _id: -1,
            _id_project: '',
            _id_user: '',
            start: '',
            end: '',
            milliseconds: '',
        };
    }

    function loadControls() {


    }

    if (_id == -1) {
        //CREATE
        //create();
        loadControls();
    } else {
        //UPDATE
        $QJApi.getController('project').get({
            action: 'hours_single',
            id: _id
        }, function(res) {
            $QJLogger.log("ProjectHoursEditController -> project hours_single -> success");
            //console.info(res.item);
            $scope.item = res.item;
            $scope.breadcrumb.active = $scope.item.userName + "'s Timestamp";
            loadControls();
        });

    }
});