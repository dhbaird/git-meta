/*
 * Copyright (c) 2016, Two Sigma Open Source
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice,
 *   this list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * * Neither the name of git-meta nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
"use strict";

/**
 * This module provides utilities for displaying status information contained
 * in `RepoStatus` objects.
 *
 */

const assert  = require("chai").assert;
const colors  = require("colors/safe");
const path    = require("path");

const GitUtil             = require("../util/git_util");
const Rebase              = require("../util/rebase");
const RepoStatus          = require("../util/repo_status");

/**
 * This value-semantic class describes a line entry to be printed in a status
 * message.
 */
class StatusDescriptor {
    /**
     * @param {RepoStatus.FILESTATUS} status
     * @param {String}                path
     * @param {String}                detail
     */
    constructor(status, path, detail) {
        this.status = status;
        this.path = path;
        this.detail = detail;
    }

    /**
     * Return a description of this object using the specified `color` function
     * to apply color and displaying `this.path` relative to the specified
     * `cwd`.
     *
     * @param {Function} color
     * @return {String}
     */
    print(color, cwd) {
        let result = "";
        const FILESTATUS = RepoStatus.FILESTATUS;
        switch(this.status) {
            case FILESTATUS.ADDED:
                result += "new file:     ";
                break;
            case FILESTATUS.MODIFIED:
                result += "modified:     ";
                break;
            case FILESTATUS.REMOVED:
                result += "deleted:      ";
                break;
            case FILESTATUS.CONFLICTED:
                result += "conflicted:   ";
                break;
            case FILESTATUS.RENAMED:
                result += "renamed:      ";
                break;
            case FILESTATUS.TYPECHANGED:
                result += "type changed: ";
                break;
        }
        result += path.relative(cwd, this.path);
        result = color(result);
        if ("" !== this.detail) {
            result += ` (${this.detail})`;
        }
        return result;
    }
}

exports.StatusDescriptor = StatusDescriptor;

/**
 * Return the specified `descriptors` sorted by path.
 *
 * @param {StatusDescriptor []} descriptors
 * @return {StatusDescriptor []}
 */
exports.sortDescriptorsByPath = function (descriptors) {
    return descriptors.sort((l, r) => {
        const lPath = l.path;
        const rPath = r.path;
        return lPath === rPath ? 0 : (lPath < rPath ? -1 : 1);
    });
};

/**
 * Return a string describing the specified `statuses`, using the specified
 * `color` function to apply color, printing paths relative to the specified
 * `cwd`.
 *
 * @param {StatusDescriptor []} statuses
 * @param {Function}            color
 * @return {String}
 */
exports.printStatusDescriptors = function (statuses, color, cwd) {
    assert.isArray(statuses);
    assert.isFunction(color);
    if (0 === statuses.length) {
        return "";                                                    // RETURN
    }
    const sorted = exports.sortDescriptorsByPath(statuses);
    const lines = sorted.map(status => "\t" + status.print(color, cwd));
    return lines.join("\n") + "\n";
};

/**
 * Return a string describing the specified `untracked` files, using the
 * specified `color` function to apply color and displaying the path relative
 * to the specified `cwd`.
 *
 * @param {String []} untracked
 * @param {Function}  color
 * @param {String}    cwd
 * @return {String}
 */
exports.printUntrackedFiles = function (untracked, color, cwd) {
    assert.isArray(untracked);
    assert.isFunction(color);
    assert.isString(cwd);
    let result = "";
    untracked.sort().forEach(filename => {
        result += "\t" + color(path.relative(cwd, filename)) + "\n";
    });
    return result;
};

/**
 * Return a description for the specified commit `relation` to be used in
 * status description.
 *
 * @param {RepoStatus.Submodule.COMMIT_RELATION} relation
 * @return {String}
 */
exports.getRelationDescription = function (relation) {
    assert.isNumber(relation);
    const RELATION = RepoStatus.Submodule.COMMIT_RELATION;
    switch (relation) {
    case RELATION.AHEAD:
        return "new commits";
    case RELATION.BEHIND:
        return "on old commit";
    case RELATION.UNRELATED:
        return "on unrelated commit";
    case RELATION.UNKNOWN:
        return "on unknown commit";
    }
    assert(false, `invalid relation: ${relation}`);
};

/**
 * Return a list of status descriptors for the submodules in the specified
 * `status` that have status changes.
 *
 * @param {RepoStatus} status
 * @return {Object}
 * @return {StatusDescriptor []} return.staged
 * @return {StatusDescriptor []} return.workdir
 * @return {String []}           return.untracked
 */
exports.listSubmoduleDescriptors = function (status) {
    assert.instanceOf(status, RepoStatus);
    const staged = [];
    const workdir = [];
    const untracked = [];
    const subs = status.submodules;
    const FILESTATUS = RepoStatus.FILESTATUS;
    Object.keys(subs).forEach(subName => {
        const sub = subs[subName];

        // Check for new submodule with no commit.

        if (!sub.isCommittable()) {
            workdir.push(new StatusDescriptor(
                                 FILESTATUS.ADDED,
                                 subName,
                                 "submodule, create commit or stage changes"));
            return;                                                   // RETURN
        }

        const commit = sub.commit;
        const index = sub.index;

        // If it's been removed, there's nothing more to add.

        if (null === index) {
            staged.push(new StatusDescriptor(FILESTATUS.REMOVED,
                                             subName,
                                             "submodule"));
            return;                                                   // RETURN
        }

        // Now, if there is anything of intereset changed in this sub, we will
        // put a description in 'detail'.

        let detail = "";
        let status = FILESTATUS.MODIFIED;  // only other choice is `ADDED`

        if (sub.isNew()) {
            detail += ", newly created";
            status = FILESTATUS.ADDED;
        }

        // If it's not new, see if the URL has changed.

        else if (commit.url !== index.url) {
            detail += ", new url";
        }

        // If workdir or index are on different commit, add a description to
        // detail.

        const relation = (() => {
            // Prefer the workdir relation.  TODO: treat index and workdir
            // relation separately.

            if (null !== sub.workdir && null !== sub.workdir.relation) {
                return sub.workdir.relation;
            }
            if (null !== sub.index) {
                return sub.index.relation;
            }
            return null;
        })();

        if (null !== relation &&
            RepoStatus.Submodule.COMMIT_RELATION.SAME !== relation) {
            detail += ", " + exports.getRelationDescription(relation);
        }

        // Now, if there is detail, add to staged section.
        // TODO: register staged and workdir updates separately.

        if ("" !== detail) {
            staged.push(new StatusDescriptor(status,
                                             subName,
                                             "submodule" + detail));
        }
    });
    return {
        staged: staged,
        workdir: workdir,
        untracked: untracked,
    };
};

/**
 * Return the status descriptors and untracked files for the meta repo and
 * acculuated from submodules in the specified `status`.
 *
 * @param {RepoStatus} status
 * @return {Object}
 * @return {StatusDescriptor []} return.staged
 * @return {StatusDescriptor []} return.workdir
 * @return {String []}           return.untracked
 */
exports.accumulateStatus = function (status) {
    const result = exports.listSubmoduleDescriptors(status);
    const staged = result.staged;
    const workdir = result.workdir;
    const untracked = result.untracked;

    function accumulateStaged(prefixPath, stagedFiles) {
        Object.keys(stagedFiles).forEach(filename => {
            staged.push(new StatusDescriptor(stagedFiles[filename],
                                             path.join(prefixPath, filename),
                                             ""));
        });
    }

    function accumulateWorkdir(prefixPath, workdirFiles) {
        Object.keys(workdirFiles).forEach(filename => {
            const status = workdirFiles[filename];
            const fullPath = path.join(prefixPath, filename);
            if (RepoStatus.FILESTATUS.ADDED === status) {
                untracked.push(fullPath);
            }
            else {
                workdir.push(new StatusDescriptor(status, fullPath, ""));
            }
        });
    }

    accumulateStaged("", status.staged);
    accumulateWorkdir("", status.workdir);

    // Accumulate data for the submodules.

    const subs = status.submodules;
    Object.keys(subs).forEach(subName => {
        const sub = subs[subName];
        if(null !== sub.workdir) {
            const subRepo = sub.workdir.status;
            accumulateStaged(subName, subRepo.staged);
            accumulateWorkdir(subName, subRepo.workdir);
        }
    });

    return {
        staged: staged,
        workdir: workdir,
        untracked: untracked,
    };
};

/**
 * Return a message describing the specified `rebase`.
 *
 * @param {Rebase}
 * @return {String}
 */
exports.printRebase = function (rebase) {
    assert.instanceOf(rebase, Rebase);
    const shortSha = GitUtil.shortSha(rebase.onto);
    return `${colors.red("rebase in progress; onto ", shortSha)}
You are currently rebasing branch '${rebase.headName}' on '${shortSha}'.
  (fix conflicts and then run "git meta rebase --continue")
  (use "git meta rebase --skip" to skip this patch)
  (use "git meta rebase --abort" to check out the original branch)
`;
};

/**
 * Return a message describing the state of the current branch in the specified
 * `status`.
 *
 * @param {RepoStatus} status
 * @return {String>
 */
exports.printCurrentBranch = function (status) {
    if (null !== status.currentBranchName) {
        return `On branch ${colors.green(status.currentBranchName)}.\n`;
    }
    return `\
On detached head ${colors.red(GitUtil.shortSha(status.headCommit))}.\n`;
};

/**
 * Return a description of the specified `status`, displaying paths relative to
 * the specified `cwd`.  Note that a value of "" for `cwd` indicates the root
 * of the repository.
 *
 * @param {RepoStatus} status
 * @param {String}     cwd
 */
exports.printRepoStatus = function (status, cwd) {
    assert.instanceOf(status, RepoStatus);
    assert.isString(cwd);

    let result = "";

    if (null !== status.rebase) {
        result += exports.printRebase(status.rebase);
    }

    result += exports.printCurrentBranch(status);

    let changes = "";
    const fileStatuses = exports.accumulateStatus(status);
    const staged = fileStatuses.staged;
    if (0 !== staged.length) {
        changes += `\
Changes to be committed:
  (use "git meta reset HEAD <file>..." to unstage)

`;
        changes += exports.printStatusDescriptors(staged, colors.green, cwd);
        changes += "\n";
    }
    const workdir = fileStatuses.workdir;
    if (0 !== workdir.length) {
        changes += `\
Changes not staged for commit:
  (use "git meta add <file>..." to update what will be committed)
  (use "git meta checkout -- <file>..." to discard changes in working \
directory)
  (commit or discard the untracked or modified content in submodules)

`;
        changes += exports.printStatusDescriptors(workdir, colors.red, cwd);
        changes += "\n";
    }
    const untracked = fileStatuses.untracked;
    if (0 !== untracked.length) {
        changes += `\
Untracked files:
  (use "git meta add <file>..." to include in what will be committed)

`;
        changes += exports.printUntrackedFiles(untracked, colors.red, cwd);
        changes += "\n";
    }

    if ("" === changes) {
        result += "nothing to commit, working tree clean\n";
    }
    else {
        result += changes;
    }

    return result;
};
