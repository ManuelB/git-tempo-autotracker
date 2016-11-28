/*!
 * ${copyright}
 */

/**
 * TimeTracker Model that has infinite forward
 * and backward values.
 *
 * @namespace
 * @name git-tempo-autotracker.model
 * @public
 */
sap.ui.define(['jquery.sap.global', 'sap/ui/model/json/JSONModel', 'sap/m/MessageToast'],
    function(jQuery, JSONModel, MessageToast) {
        "use strict";


        /**
         * Constructor for a new TimeTrackerModel.
         *
         * @class
         * Model implementation for TimeTrackerModel
         *
         * @extends sap.ui.model.JSONModel
         *
         * @author Incentergy GmbH
         * @version ${version}
         *
         * @param {object} oData a list of files
         * @constructor
         * @public
         * @alias git-tempo-autotracker.model.TimeTrackerModel
         */
        var TimeTrackerModel = JSONModel.extend("git-tempo-autotracker.model.TimeTrackerModel", /** @lends git-tempo-autotracker.model.TimeTrackerModel.prototype */ {

            constructor: function() {
                JSONModel.apply(this, [{ "startDate": this.getMonday(new Date()), "endDate": this.getFriday(new Date()), "issueDayTimeLog": [] }, true]);
            },
            getMonday: function(d) {
                d = new Date(d);
                var day = d.getDay(),
                    diff = d.getDate() - day + (day == 0 ? -6 : 1); // adjust when day is sunday
                return new Date(d.setDate(diff));
            },
            getFriday: function(d) {
                d = new Date(d);
                var day = d.getDay(),
                    diff = d.getDate() - day + 5;
                return new Date(d.setDate(diff));
            },
            _getObject: function(path, oContext) {
                var fullPath = path;
                if (oContext) {
                    fullPath = oContext.getPath() + "/" + fullPath;
                }
                if (fullPath == "/dates") {
                    var dates = this.generateDates(true);
                    return dates;
                } else if (fullPath.match(/\/dates\/(\d+)\/value/)) {
                    var dates = this.generateDates(true);
                    return RegExp.$1 in dates ? dates[RegExp.$1].value : undefined;
                } else {
                    return JSONModel.prototype._getObject.apply(this, arguments);
                }
            },
            generateDates: function(addTicket) {
                var startDate = this.getProperty("/startDate");
                var endDate = this.getProperty("/endDate");
                var dates = [];
                if (addTicket) {
                    dates.push({ "value": "Ticket" });
                }
                var loopDate = new Date(startDate.getTime());
                loopDate.setHours(0);
                loopDate.setMinutes(0);
                loopDate.setSeconds(0);
                loopDate.setMilliseconds(0);
                while (loopDate.getTime() <= endDate.getTime()) {
                    dates.push({ "value": new Date(loopDate.getTime()) });
                    loopDate.setTime(24 * 60 * 60 * 1000 + loopDate.getTime());
                }
                return dates;
            },
            fetchLogs: function(bitbucketConfiguration) {
                var me = this;
                var oHeaders = {
                    "Authorization": "Basic " + btoa(bitbucketConfiguration.username + ':' + bitbucketConfiguration.password)
                };
                var startDate = this.getProperty("/startDate");
                var endDate = this.getProperty("/endDate");

                $.ajax({
                    url: bitbucketConfiguration.baseUrl + "/rest/api/1.0/projects/" + bitbucketConfiguration.project + "/repos/" + bitbucketConfiguration.repository + "/commits?limit=500",
                    method: "GET",
                    headers: oHeaders
                }).done(function(data) {
                    var map = {};
                    var dates2issues = {};
                    data.values.sort(function(a, b) {
                        return (a.authorTimestamp - b.authorTimestamp);
                    });
                    for (var i in data.values) {
                        var commit = data.values[i];
                        var date = new Date(commit.authorTimestamp);
                        if (bitbucketConfiguration.author == commit.author.name && startDate.getTime() < date.getTime() && endDate.getTime() > date.getTime()) {
                            // Remove everything timeinformation
                            date.setHours(0);
                            date.setMinutes(0);
                            date.setSeconds(0);
                            date.setMilliseconds(0);
                            var unixTimestamp = date.getTime();
                            if ("properties" in commit) {
                                for (var n in commit.properties["jira-key"]) {
                                    var issueKey = commit.properties["jira-key"][n];
                                    if (!(issueKey in map)) {
                                        map[issueKey] = true;
                                        if (!(unixTimestamp in dates2issues)) {
                                            dates2issues[unixTimestamp] = [];
                                        }
                                        dates2issues[unixTimestamp].push(issueKey);
                                    }
                                }
                            }
                        }
                    }
                    var issueDayTimeLog = [];
                    var dates = me.generateDates(false);
                    for (var key in map) {
                        var hoursByDay = [{ "ticket": key, "type": "ticket" }]
                        for (var x in dates) {
                            var found = false;
                            var timestamp = dates[x].value.getTime();
                            var issues = dates2issues[timestamp];
                            if (issues) {
                                for (var y in issues) {
                                    var issue = issues[y];
                                    if (issue == key) {
                                        hoursByDay.push({ "hours": 8 / issues.length, "save": true, "type": "hours", "date": dates[x].value });
                                        found = true;
                                    }
                                }
                            }
                            if (!found) {
                                hoursByDay.push({ "hours": 0, "save": false, "type": "hours", "date": dates[x].value });
                            }
                        }
                        issueDayTimeLog.push({ "hoursByDay": hoursByDay });
                    }
                    var issuesLastDay = [];
                    // Find empty days and use days from before
                    for (var x in dates) {
                        var timestamp = dates[x].value.getTime();
                        var issues = dates2issues[timestamp];

                        if ((!issues || issues.length == 0) && issuesLastDay.length > 0) {
                            var issue = issuesLastDay[issuesLastDay.length - 1];
                            for (var z in issueDayTimeLog) {
                                if (issueDayTimeLog[z].hoursByDay[0].ticket == issue) {
                                    issueDayTimeLog[z].hoursByDay[parseInt(x) + 1].hours = 8;
                                    issueDayTimeLog[z].hoursByDay[parseInt(x) + 1].save = true;
                                    issueDayTimeLog[z].hoursByDay[parseInt(x) + 1].date = dates[x].value;
                                }
                            }
                        } else if (issues && issues.length > 0) {
                            issuesLastDay = dates2issues[timestamp];
                        }
                    }
                    if (issueDayTimeLog.length === 0) {
                        MessageToast.show("No issues for this week found.");
                    }
                    me.setProperty("/issueDayTimeLog", issueDayTimeLog);
                }).always(function() {
                    me.fireRequestCompleted();
                });
            }

        });
        return TimeTrackerModel;
    });