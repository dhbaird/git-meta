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

const assert = require("chai").assert;
const deeper = require("deeper");

const RepoAST = require("../../lib/util/repoast");

describe("repoast", function () {

    describe("Submodule", function () {
        it("breath", function () {
            const s = new RepoAST.Submodule("foo", "bar");
            assert.instanceOf(s, RepoAST.Submodule);
            assert.isFrozen(s);
            assert.equal(s.url, "foo");
            assert.equal(s.sha, "bar");
        });
    });

    describe("Commit", function () {

        // Basically just testing that the constructor and accessors perform.

        const cases = {
            "trivial": {
                input: undefined,
                eparents: [],
                echanges: {},
            },
            "simple": {
                input: { parents: ["foo"], changes: { a: "b" } },
                eparents: ["foo"],
                echanges: { a: "b"},
            },
            "delete change": {
                input: {
                    changes: { b: null },
                },
                eparents: [],
                echanges: { b: null, },

            },
            "add a submodule": {
                input: {
                    changes: { b: new RepoAST.Submodule("x", "y") },
                },
                eparents: [],
                echanges: { b: new RepoAST.Submodule("x", "y"), },
            },
        };
        Object.keys(cases).forEach(caseName => {
            it(caseName, function () {
                const c = cases[caseName];
                const obj = new RepoAST.Commit(c.input);
                assert.isFrozen(obj);

                // Check that result is expected, and not same as input object.

                assert.deepEqual(obj.parents, c.eparents);
                assert(deeper(obj.changes, c.echanges));

                if (c.input) {
                    assert.notEqual(obj.parents, c.input.parent);
                    assert.notEqual(obj.changes, c.input.change);
                }
            });
        });
    });
    describe("Remote", function () {

        // Basically just testing that the constructor and accessors perform.

        const cases = {
            "trivial": {
                iurl: "x",
                args: undefined,
                eurl: "x",
                ebranches: {},
            },
            "branches": {
                iurl: "y",
                args: { branches: { x: "y", q: "r" } },
                eurl: "y",
                ebranches: { x: "y", q: "r" },
            },
        };
        Object.keys(cases).forEach(caseName => {
            it(caseName, function () {
                const c = cases[caseName];
                const obj = new RepoAST.Remote(c.iurl, c.args);
                assert.isFrozen(obj);

                // Check that result is expected, and not same as input object.

                assert.equal(obj.url, c.eurl);
                assert.deepEqual(obj.branches, c.ebranches);
                assert(deeper(obj.changes, c.echanges));

                if (c.args && c.args.branches) {
                    assert.notEqual(obj.branches, c.args.branches);
                }
            });
        });
    });

    describe("AST", function () {

        describe("constructor", function () {
            // Basically just testing that the constructor and accessors
            // perform.

            const Commit = RepoAST.Commit;
            const Remote = RepoAST.Remote;

            const c1       = new Commit();
            const cWithPar = new Commit({ parents: ["1"] });
            const cWithSubmodule = new Commit({
                changes: { x: new RepoAST.Submodule("foo", "bar") }
            });

            function m(input,
                       expected,
                       fails) {
                expected = expected || {};
                return {
                    input   : input,
                    ecommits: ("commits" in expected) ? expected.commits: {},
                    ebranches:
                        ("branches" in expected) ? expected.branches : {},
                    ehead   : ("head" in expected) ? expected.head : null,
                    ebranch : ("branch" in expected) ? expected.branch : null,
                    eremotes: ("remotes" in expected) ? expected.remotes : {},
                    fails   : fails,
                };
            }

            const cases = {
                "trivial": m(undefined, undefined, false),
                "simple" : m(
                    {
                        commits: {},
                        branches: {},
                        head: null,
                        currentBranchName: null
                    },
                    undefined,
                    false),
                "branchCommit": m({
                    commits: {"1":c1, "2": cWithPar},
                    branches: {"master": "2"},
                    head: "1",
                    currentBranchName: null,
                }, {
                    commits: {"1":c1, "2": cWithPar},
                    branches: {"master": "2"},
                    head: "1",
                }, false),
                "with submodule": m({
                    commits: {"1":cWithSubmodule, "2": cWithPar},
                    branches: {"master": "2"},
                    head: "1",
                    currentBranchName: null,
                }, {
                    commits: {"1":cWithSubmodule, "2": cWithPar},
                    branches: {"master": "2"},
                    head: "1",
                }, false),
                "remotes": m({
                    remotes: {
                        foo: new Remote("my-url"),
                    }
                }, {
                    remotes: { foo: new Remote("my-url") },
                }, false),
                "badParent": m({ commits: { "2": cWithPar }},
                               undefined,
                               true),
                "badBranch": m({ branches: { "master": "3"}}, undefined, true),
                "badHead": m({ head: "3"}, undefined, true),
                "branch": m({
                    commits: {"1": c1},
                    branches: {"master": "1"},
                    head: "1",
                    currentBranchName: "master",
                }, {
                    commits: {"1": c1},
                    branches: {"master": "1"},
                    head: "1",
                    branch: "master",
                }, false),
                "badBranch with good commit": m({
                    commits: {"1": c1},
                    branches: {"aster": "1"},
                    head: null,
                    currentBranchName: "master",
                }, undefined, true),
                "unreachable": m({ commits: {"1": c1} }, undefined, true),
                "reachedByHead": m({
                    commits: {"1": c1},
                    head: "1",
                }, {
                    commits: {"1": c1},
                    head: "1",
                }, false),
                "reachedByRemote": m({
                    commits: {"1": c1},
                    remotes: {
                        bar: new Remote("foo", { branches: { "bar": "1"}, }),
                    },
                }, {
                    commits: {"1": c1},
                    remotes: {
                        bar: new Remote("foo", { branches: { "bar": "1"}, }),
                    },
                }, false),
                "bare with current branch": m({
                    commits: {"1":c1, "2": cWithPar},
                    branches: {"master": "2"},
                    head: null,
                    currentBranchName: "master",
                }, {
                    commits: {"1":c1, "2": cWithPar},
                    branches: {"master": "2"},
                    branch: "master",
                    head: null,
                }, false),
            };
            Object.keys(cases).forEach(caseName => {
                it(caseName, function () {
                    const c = cases[caseName];
                    if (c.fails) {
                        // `fails` indicates that it throws due to out of
                        // contract.  We don't document what type of error is
                        // thrown on contract violation.

                        assert.throws(() => new RepoAST(c.input), "");
                        return;                                       // RETURN
                    }
                    const obj = new RepoAST(c.input);
                    assert(deeper(obj.commits, c.ecommits));
                    assert(deeper(obj.branches, c.ebranches));
                    assert.equal(obj.head, c.ehead);
                    assert.equal(obj.currentBranchName, c.ebranch);

                    if (c.input) {
                        assert.notEqual(obj.commits, c.input.commits);
                        assert.notEqual(obj.branches, c.input.branches);
                    }
                });
            });
        });

        describe("renderCommit", function () {
            const Commit = RepoAST.Commit;
            const c1 = new Commit({ changes: { foo: "bar" }});
            const c2 = new Commit({ changes: { foo: "baz" }});
            const mergeChild = new Commit({
                parents: ["3"],
                changes: { bam: "blast" },
            });
            const merge = new Commit({
                parents: ["1", "2"],
                changes: {}
            });
            const deleter = new Commit({
                parents: ["1"],
                changes: { foo: null }
            });
            const submodule = new RepoAST.Submodule("x", "y");
            const subCommit = new Commit({
                parents: ["1"],
                changes: { baz: submodule },
            });
            const cases = {
                "one": {
                    commits: { "1": c1},
                    from: "1",
                    expected: { foo: "bar" },
                    ecache: {
                        "1": { foo: "bar" },
                    },
                },
                "merge": {
                    commits: { "1": c1, "2": c2, "3": merge},
                    from: "3",
                    expected: { foo: "bar" },
                    ecache: {
                        "1": c1.changes,
                        "3": { foo: "bar" },
                    },
                },
                "merge child": {
                    commits: { "1": c1, "2": c2, "3": merge, "4": mergeChild},
                    from: "4",
                    expected: { foo: "bar", bam: "blast" },
                    ecache: {
                        "1": c1.changes,
                        "3": { foo: "bar" },
                        "4": { foo: "bar", bam: "blast" },
                    },
                },
                "deletion": {
                    commits: { "1": c1, "2": deleter },
                    from: "2",
                    expected: {},
                    ecache: {
                        "1": c1.changes,
                        "2": {}
                    },
                },
                "with sub": {
                    commits: { "1": c1, "2": subCommit },
                    from: "2",
                    expected: { foo: "bar", baz: submodule },
                    ecache: {
                        "1": c1.changes,
                        "2": { foo: "bar", baz: submodule },
                    },
                },
                "use the cache": {
                    commits: { "1": c1 },
                    from: "1",
                    cache: { "1": { foo: "baz" } },
                    expected: { foo: "baz" },
                    ecache: { "1": { foo: "baz"}, },
                },
            };
            Object.keys(cases).forEach(caseName => {
                const c = cases[caseName];
                it(caseName, function () {
                    let cache = c.cache || {};
                    const result =
                                RepoAST.renderCommit(cache, c.commits, c.from);
                    assert.deepEqual(result,
                                     c.expected,
                                     JSON.stringify(result));
                    assert.deepEqual(cache, c.ecache, JSON.stringify(cache));
                });
            });
        });
    });

    describe("AST.copy", function () {
        const base = new RepoAST({
            commits: { "1": new RepoAST.Commit()},
            branches: { "master": "1" },
            head: "1",
            currentBranchName: "master",
        });
        const newArgs = {
            commits: { "2": new RepoAST.Commit()},
            branches: { "foo": "2" },
            head: "2",
            currentBranchName: "foo",
            remotes: { "foo": new RepoAST.Remote("meeeee") },
        };
        const cases = {
            "trivial": {
                i: undefined,
                e: base,
            },
            "all": {
                i: newArgs,
                e: new RepoAST(newArgs),
            },
        };
        Object.keys(cases).forEach(caseName => {
            it(caseName, function () {
                const c = cases[caseName];
                const obj = base.copy(c.i);
                assert(deeper(obj.commits, c.e.commits));
                assert(deeper(obj.branches, c.e.branches));
                assert(deeper(obj.remotes, c.e.remotes));
                assert.equal(obj.head, c.e.head);
                assert.equal(obj.currentBranchName, c.e.currentBranchName);
            });
        });
    });
});