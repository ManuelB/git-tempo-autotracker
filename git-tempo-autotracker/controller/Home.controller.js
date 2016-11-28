sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "../model/TimeTrackerModel"
], function(Controller, JSONModel, MessageToast, TimeTrackergModel) {
    "use strict";
    return Controller.extend("git-tempo-autotracker.controller.Home", {
        onInit: function() {
            var timeTrackerModel = new TimeTrackergModel();
            this.getView().setModel(timeTrackerModel);
        },
        onJiraConfigurationShow: function(oEvent, callback) {
            var oJiraConfigurationModel = new JSONModel({ "baseUrl": "", "username": "", "password": "" });
            if (window.localStorage.jiraConfiguration) {
                oJiraConfigurationModel.setData(JSON.parse(window.localStorage.jiraConfiguration));
            }
            if (!this._oJiraConfigurationDialog) {
                this._oJiraConfigurationDialog = sap.ui.xmlfragment("git-tempo-autotracker.view.JiraConfigurationDialog", this);
                this._oJiraConfigurationDialog.setModel(oJiraConfigurationModel);
                this.getView().addDependent(this._oJiraConfigurationDialog);
            }
            this._oJiraConfigurationDialog.open();
            if (typeof callback == "function") {
                this._oJiraConfigurationDialog.attachEventOnce("afterClose", function() {
                    callback();
                });
            }
        },
        onJiraConfigurationConfirm: function() {
            window.localStorage.jiraConfiguration = JSON.stringify(this._oJiraConfigurationDialog.getModel().getData());
            this._oJiraConfigurationDialog.close();
        },
        onBitbucketConfigurationShow: function(oEvent, callback) {
            var oBitbucketConfigurationModel = new JSONModel({ "baseUrl": "", "username": "", "password": "", "project": "", "repository": "", "author": "" });
            if (window.localStorage.bitbucketConfiguration) {
                oBitbucketConfigurationModel.setData(JSON.parse(window.localStorage.bitbucketConfiguration));
            }
            if (!this._oBitbucketConfigurationDialog) {
                this._oBitbucketConfigurationDialog = sap.ui.xmlfragment("git-tempo-autotracker.view.BitbucketConfigurationDialog", this);
                this._oBitbucketConfigurationDialog.setModel(oBitbucketConfigurationModel);
                this.getView().addDependent(this._oBitbucketConfigurationDialog);
            }
            this._oBitbucketConfigurationDialog.open();
            if (typeof callback == "function") {
                this._oBitbucketConfigurationDialog.attachEventOnce("afterClose", function() {
                    callback();
                });
            }
        },
        onBitbucketConfigurationConfirm: function() {
            window.localStorage.bitbucketConfiguration = JSON.stringify(this._oBitbucketConfigurationDialog.getModel().getData());
            this._oBitbucketConfigurationDialog.close();
        },
        onGenereateTimetrackingRecommendation: function() {
            var me = this;
            if (!window.localStorage.bitbucketConfiguration) {
                this.onBitbucketConfigurationShow(undefined, function() {
                    me.onGenereateTimetrackingRecommendation();
                });
            } else {
                var bitbucketConfiguration = JSON.parse(window.localStorage.bitbucketConfiguration);
                this.getView().setBusy(true);
                this.getView().getModel().fetchLogs(bitbucketConfiguration);
                this.getView().getModel().attachEventOnce("requestCompleted", function() {
                    me.getView().setBusy(false);
                });
            }

        },
        formatValue: function(value) {
            if (value instanceof Date) {
                return sap.ui.core.format.DateFormat.getInstance({ style: "short" }).format(value);
            } else {
                return value;
            }
        },
        onSendCheckedLogsToJira: function() {
            var me = this;
            if (!window.localStorage.jiraConfiguration) {
                this.onJiraConfigurationShow(undefined, function() {
                    me.onSendCheckedLogsToJira();
                });
            } else {
                var jiraConfiguration = JSON.parse(window.localStorage.jiraConfiguration);
                var oHeaders = {
                    "Authorization": "Basic " + btoa(jiraConfiguration.username + ':' + jiraConfiguration.password),
                    "X-Atlassian-Token": "no-check"
                };

                var requests = 0;
                var totalRequests = 0;
                this.getView().setBusy(true);
                var issueDayTimeLog = this.getView().getModel().getProperty("/issueDayTimeLog");
                var nothingFound = true;
                for (var issueNum in issueDayTimeLog) {
                    var hoursByDay = issueDayTimeLog[issueNum].hoursByDay;
                    var issue = issueDayTimeLog[issueNum].hoursByDay[0].ticket;
                    for (var logNum in hoursByDay) {
                        if (hoursByDay[logNum].save) {
                            nothingFound = false;
                            requests++;
                            totalRequests++;
                            var date = hoursByDay[logNum].date;
                            var month = date.getMonth() + 1;
                            var days = date.getDate();
                            $.ajax({
                                url: jiraConfiguration.baseUrl + "/rest/api/2/issue/" + issue + "/worklog",
                                method: "POST",
                                data: JSON.stringify({
                                    "comment": "Autotrack via git-tempo-autotracker.",
                                    "started": (date.getYear() + 1900) + "-" + (month < 10 ? "0" : "") + month + "-" + (days < 10 ? "0" : "") + days + "T00:00:00.000Z",
                                    "timeSpentSeconds": hoursByDay[logNum].hours * 3600
                                }),
                                contentType: "application/json",
                                dataType: "json",
                                headers: oHeaders
                            }).always(function() {
                                requests--;
                                if (requests === 0) {
                                    me.getView().setBusy(false);
                                    sap.m.MessageToast.show(totalRequests + " worklogs send to JIRA.");
                                }
                            });
                        }
                    }
                }
                if (nothingFound) {
                    this.getView().setBusy(false);
                }
            }
        }
    });
});