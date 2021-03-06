"use strict";

var Game = {
    config: {
        canvasWidth: 880, // 1280
        canvasHeight: 495, // 720
        ticksPerSecond: 120,
        maxTicksPerDraw: 6,
        keyboardMapping: {
            16: "shift",
            27: "cancel",
            32: "enter",
            37: "left",
            38: "up",
            39: "right",
            40: "down",
            67: "cancel",
            69: "edit",
            82: "reload",
            88: "enter"
        }
    },
    lerp4: function (a, b, t) {
        return [
            a[0] * (1 - t) + b[0] * t,
            a[1] * (1 - t) + b[1] * t,
            a[2] * (1 - t) + b[2] * t,
            a[3] * (1 - t) + b[3] * t
        ]
    },
    random: function (min, max) {
        return min + Math.random() * (max - min)
    },
    randomPick: function (list) {
        return list[Math.floor(Math.random() * list.length)];
    },
    makeTriangle: function (cellX, cellY, bottomColor, middleColor, topColor, isTalker, message, state, markOccupied) {
        var x = (cellX + 0.5) * state.level.cellSize;
        var y = (cellY + 0.5) * state.level.cellSize;
        if (isTalker) {
            y += 0.2 * state.level.cellSize;
        }
        var triangle = {
            x: x, y: y, angle: 0, scale: 1,
            transform: undefined,
            cellX: cellX, cellY: cellY,
            targetX: x, targetY: y,
            nextMoves: [],
            isTalker: isTalker,
            isDead: false,
            deadTime: 0,
            message: message !== undefined ? {
                texture: "message_" + message,
                x: -0.2 * state.level.cellSize,
                y: 0.3 * state.level.cellSize,
                angle: 0,
                scale: 0,
                targetScale: 0,
                opacity: 0,
                targetOpacity: 0,
                transform: undefined,
                name: message
            } : undefined,
            shadow: {
                x: 2, y: -29.5 + 8, angle: 0, scale: 1,
                transform: undefined
            },
            eye: {
                x: 0, y: 8, angle: 0, scale: 1,
                transform: undefined
            },
            eyeCenter: {
                x: 0, y: 8, angle: 0, scale: 1,
                baseX: 0, baseY: 8,
                targetX: 0, targetY: 8,
                transform: undefined
            },
            bottom: {
                x: 2, y: -21.5, angle: 0, scale: 1,
                baseX: 2, baseY: -21.5,
                transform: undefined,
                color: bottomColor,
                resetColor: bottomColor
            },
            middle: {
                x: 0, y: 8, angle: 0, scale: 1,
                baseX: 0, baseY: 8,
                transform: undefined,
                color: middleColor,
                resetColor: middleColor
            },
            top: {
                x: 2, y: 37.5, angle: 0, scale: 1,
                baseX: 2, baseY: 37.5,
                transform: undefined,
                color: topColor,
                resetColor: topColor
            }
        };
        if (markOccupied)
            state.level.index[cellX + "_" + cellY].occupiedBy = triangle;
        if (message !== undefined) {
            GG.Textures.loadImage(state.gl, "textures/messages/" + message + ".png", function (texture) {
                state.textures["message_" + message] = texture;
            });
        }
        return triangle;
    },
    start: function (canvas) {
        canvas.setAttribute("width", Game.config.canvasWidth);
        canvas.setAttribute("height", Game.config.canvasHeight);

        // TODO: check for gl failure
        // TODO: check/test for lost context
        var gl = canvas.getContext("webgl", {alpha: false}) || canvas.getContext("experimental-webgl", {alpha: false});

        var state = {
            gl: gl,
            audio: GG.Sounds.getContext(),
            loadLock: 0,
            shader: {
                program: undefined,
                attributes: {
                    position: undefined,
                    uv: undefined
                },
                uniforms: {
                    model: undefined,
                    view: undefined,
                    sampler: undefined,
                    time: undefined,
                    tint: undefined
                }
            },
            meshes: {},
            textures: {
                ice: undefined,
                ground: undefined,
                wall: undefined,
                exit_closed: undefined,
                exit_open: undefined,
                trap_closed: undefined,
                trap_open: undefined,
                triangle_shadow: undefined,
                triangle_eye: undefined,
                triangle_eye_center: undefined,
                triangle_eye_center_npc: undefined,
                triangle_bottom_mask: undefined,
                triangle_middle_mask: undefined,
                triangle_top_mask: undefined,
                triangle_bottom_overlay: undefined,
                triangle_middle_overlay: undefined,
                triangle_top_overlay: undefined,
                fill: undefined,
                edit_mode: undefined,
                menu_bottom: undefined,
                menu_middle: undefined,
                menu_top: undefined,
                background: undefined
            },
            sounds: {
                blocked: undefined,
                fall: undefined,
                swap: undefined,
                walk: undefined,
                win: undefined
            },
            time: 0,
            background: [0.369, 0.314, 0.38],
            camera: {
                x: 0, y: 0, angle: 0, scale: 512 / Game.config.canvasWidth,
                targetX: 0, targetY: 0, targetScale: 512 / Game.config.canvasWidth
            },
            level: {
                nextLevel: 0,
                width: 0,
                height: 0,
                cellSize: 128,
                cells: [],
                index: {},
                centerX: 0,
                centerY: 0,
                state: "intro",
                swapPart: "top",
                swapNpc: undefined
            },
            player: undefined,
            npcs: [],
            colors: {
                red: [0.36, 0.1, 0.1, 1.0],
                green: [0.43, 0.48, 0.13, 1.0],
                blue: [0.18, 0.26, 0.39, 1.0],
                orange: [0.75, 0.36, 0, 1],
                magenta: [0.55, 0.21, 0.48, 1.0],
                yellow: [0.79, 0.76, 0, 1.0]
            },
            editable: false,
            intro: {
                activeMenu: "top",
                wasActive: true,
                introTime: 0
            }
        };

        state.player = Game.makeTriangle(0, 0, "red", "red", "red", false, undefined, state, false);
        state.camera.targetX = state.player.x - 0.7 * state.level.cellSize;
        state.camera.targetY = state.player.y + 0.5 * state.level.cellSize;
        state.camera.targetScale = 512 / Game.config.canvasWidth;
        state.camera.x = state.camera.targetX;
        state.camera.y = state.camera.targetY;
        state.camera.scale = state.camera.targetScale;

        state.loadLock += 1;
        GG.Shaders.loadProgram(gl, "shaders/fragment.glsl", "shaders/vertex.glsl", function (program) {
            state.loadLock -= 1;
            state.shader.program = program;
            Object.keys(state.shader.attributes).forEach(function (key) {
                state.shader.attributes[key] = state.gl.getAttribLocation(program, key);
            });
            Object.keys(state.shader.uniforms).forEach(function (key) {
                state.shader.uniforms[key] = state.gl.getUniformLocation(program, key);
            });
            state.meshes.quad_128 = GG.Meshes.createQuad(state.gl, state.shader.attributes.position, state.shader.attributes.uv, 128, 128);
            state.meshes.quad_256 = GG.Meshes.createQuad(state.gl, state.shader.attributes.position, state.shader.attributes.uv, 256, 256);
            state.meshes.quad_1024 = GG.Meshes.createQuad(state.gl, state.shader.attributes.position, state.shader.attributes.uv, 1024, 1024);
            state.meshes.quad_4096 = GG.Meshes.createQuad(state.gl, state.shader.attributes.position, state.shader.attributes.uv, 4096, 4096);
            state.meshes.message = GG.Meshes.createQuad(state.gl, state.shader.attributes.position, state.shader.attributes.uv, 128, 128, 0, 1);
            state.meshes.edit_mode = GG.Meshes.createQuad(state.gl, state.shader.attributes.position, state.shader.attributes.uv, 128, 128, 1, 0);
            state.meshes.menu_text = GG.Meshes.createQuad(state.gl, state.shader.attributes.position, state.shader.attributes.uv, 256, 256, 0, 1);
        });

        Object.keys(state.textures).forEach(function (textureName) {
            state.loadLock += 1;
            GG.Textures.loadImage(gl, "textures/" + textureName + ".png", function (texture) {
                state.textures[textureName] = texture;
                state.loadLock -= 1;
            }, function (error) {
                state.loadLock -= 1;
                console.error(error);
            });
        });

        Object.keys(state.sounds).forEach(function (soundName) {
            GG.Sounds.loadSound(state.audio, "sounds/" + soundName + ".wav", function (sound) {
                state.sounds[soundName] = sound;
            });
        });

        GG.Loop.run(canvas, Game.config.ticksPerSecond, Game.config.maxTicksPerDraw, Game.config.keyboardMapping, Game.tick, Game.draw, state);
        return state;
    },
    indexLevel: function (state) {
        state.level.cells.sort(function (a, b) {
            if (a.y == b.y)
                return a.x - b.x;
            else
                return b.y - a.y;
        });

        var minX = Infinity;
        var maxX = -Infinity;
        var minY = Infinity;
        var maxY = -Infinity;
        state.level.index = {};
        for (var i = 0; i < state.level.cells.length; ++i) {
            var cell = state.level.cells[i];
            state.level.index[cell.cellX + "_" + cell.cellY] = cell;
            minX = Math.min(minX, cell.cellX);
            maxX = Math.max(maxX, cell.cellX);
            minY = Math.min(minY, cell.cellY);
            maxY = Math.max(maxY, cell.cellY);
        }

        state.level.width = maxX - minX + 1;
        state.level.height = maxY - minY + 1;

        state.level.centerX = 0.5 * (minX + maxX + 1) * state.level.cellSize;
        state.level.centerY = 0.5 * (minY + maxY + 1) * state.level.cellSize;
    },
    createCell: function (x, y, type, state) {
        var cell = {
            type: type,
            x: (x + 0.5) * state.level.cellSize,
            y: (y + 0.5) * state.level.cellSize,
            angle: 0,
            scale: 1,
            transform: undefined,
            cellX: x,
            cellY: y,
            occupiedBy: undefined,
            isOpen: type === "exit"
        };
        cell.transform = GG.Transforms.createTRS(cell.x, cell.y, cell.angle, cell.scale);
        return cell;
    },
    loadLevel: function (state, isReload) {
        var definition = Game.Levels[state.level.nextLevel];

        state.level.state = "load";
        state.level.loadTime = state.time;

        state.level.cells = [];
        definition.level.forEach(function (cellDefinition) {
            state.level.cells.push(Game.createCell(cellDefinition.x, cellDefinition.y, cellDefinition.type, state));
        });

        Game.indexLevel(state);

        var previousPlayerX = state.player.x;
        var previousPlayerY = state.player.y;
        state.player.cellX = definition.player.x;
        state.player.cellY = definition.player.y;
        state.player.x = (definition.player.x + 0.5) * state.level.cellSize;
        state.player.y = (definition.player.y + 0.5) * state.level.cellSize;
        state.player.targetX = state.player.x;
        state.player.targetY = state.player.y;
        state.player.scale = 1;
        state.player.angle = 0;
        state.player.isDead = false;
        state.player.nextMoves = [];
        if (isReload) {
            state.player.bottom.color = state.player.bottom.resetColor;
            state.player.middle.color = state.player.middle.resetColor;
            state.player.top.color = state.player.top.resetColor;
        } else {
            state.player.bottom.resetColor = state.player.bottom.color;
            state.player.middle.resetColor = state.player.middle.color;
            state.player.top.resetColor = state.player.top.color;
        }

        state.npcs = [];
        definition.npcs.forEach(function (npcDefinition) {
            var bottom = npcDefinition.bottom;
            var middle = npcDefinition.middle;
            var top = npcDefinition.top;
            if (state.player.top.color !== definition.player.expectedColor) {
                if (bottom == state.player.top.color)
                    bottom = definition.player.expectedColor;
                else if (bottom == definition.player.expectedColor)
                    bottom = state.player.top.color;
                if (middle == state.player.top.color)
                    middle = definition.player.expectedColor;
                else if (middle == definition.player.expectedColor)
                    middle = state.player.top.color;
                if (top == state.player.top.color)
                    top = definition.player.expectedColor;
                else if (top == definition.player.expectedColor)
                    top = state.player.top.color;
            }
            state.npcs.push(Game.makeTriangle(npcDefinition.x, npcDefinition.y, bottom, middle, top,
                npcDefinition.isTalker, npcDefinition.message, state, true));
        });

        state.camera.targetX = state.player.x;
        state.camera.targetY = state.player.y;
        state.camera.targetScale = 512 / Game.config.canvasWidth;
        if (state.intro.wasActive) {
            state.intro.wasActive = false;
            var previousCameraX = state.camera.x;
            var previousCameraY = state.camera.y;
            state.camera.x = state.player.x + previousCameraX - previousPlayerX;
            state.camera.y = state.player.y + previousCameraY - previousPlayerY;
        } else {
            state.camera.x = state.player.x;
            state.camera.y = state.player.y;
        }
    },
    dumpLevel: function (state) {
        var cells = [];
        state.level.cells.forEach(function (cell) {
            cells.push({x: cell.cellX, y: cell.cellY, type: cell.type});
        });
        var npcs = [];
        state.npcs.forEach(function (npc) {
            npcs.push({
                x: npc.cellX,
                y: npc.cellY,
                bottom: npc.bottom.color,
                middle: npc.middle.color,
                top: npc.top.color,
                isTalker: npc.isTalker,
                message: npc.message ? npc.message.name : undefined
            });
        });
        return {
            player: {x: state.player.cellX, y: state.player.cellY, expectedColor: state.player.top.color},
            npcs: npcs,
            level: cells
        };
    },
    editLevel: function (state, keyboardInput, mouseInput, forceRefresh) {
        if (mouseInput.justReleased) {
            var mX = mouseInput.x - 0.5 * Game.config.canvasWidth;
            var mY = Game.config.canvasHeight - mouseInput.y - 0.5 * Game.config.canvasHeight;
            var cellX = Math.floor((mX * state.camera.scale + state.camera.x) / state.level.cellSize);
            var cellY = Math.floor((mY * state.camera.scale + state.camera.y) / state.level.cellSize);
            var subCellY = Math.floor(((mY * state.camera.scale + state.camera.y) / state.level.cellSize - cellY) * 3);
            var cellIndex = cellX + "_" + cellY;
            if (cellIndex in state.level.index) {
                var cell = state.level.index[cellIndex];
                if (cell.occupiedBy === undefined && (state.player.cellX != cellX || state.player.cellY != cellY)) {
                    if (keyboardInput.shift) {
                        if (cell.type === "ground" || cell.type === "ice")
                            state.npcs.push(Game.makeTriangle(cellX, cellY, "red", "green", "blue", false, undefined, state, true));
                        else if (cell.type === "wall")
                            state.npcs.push(Game.makeTriangle(cellX, cellY, "red", "green", "blue", true, "good_luck", state, true));
                    } else {
                        if (cell.type === "ground")
                            cell.type = "ice";
                        else if (cell.type === "ice")
                            cell.type = "trap";
                        else if (cell.type === "trap")
                            cell.type = "wall";
                        else if (cell.type === "wall" || cell.type === "exit") {
                            for (var i = 0; i < state.level.cells.length; ++i) {
                                if (state.level.cells[i] === cell) {
                                    state.level.cells.splice(i, 1);
                                    break;
                                }
                            }
                            Game.indexLevel(state);
                        }
                    }
                } else {
                    if (keyboardInput.shift && cell.occupiedBy !== undefined) {
                        for (i = 0; i < state.npcs.length; ++i) {
                            if (state.npcs[i] === cell.occupiedBy) {
                                state.npcs.splice(i, 1);
                                cell.occupiedBy = undefined;
                                break;
                            }
                        }
                    } else {
                        var triangle = cell.occupiedBy !== undefined ? cell.occupiedBy : state.player;
                        var part = ["bottom", "middle", "top"][subCellY];
                        var partColor = triangle[part].color;
                        var colors = Object.keys(state.colors);
                        for (i = 0; i < colors.length; ++i) {
                            if (colors[i] == partColor) {
                                var newColor = colors[(i + 1) % colors.length];
                                triangle[part].color = newColor;
                                triangle[part].resetColor = newColor;
                                break;
                            }
                        }
                    }
                }
            } else {
                state.level.cells.push(Game.createCell(cellX, cellY, keyboardInput.shift ? "exit" : "ground", state));
                Game.indexLevel(state);
            }
        }
        if (mouseInput.justReleased || forceRefresh) {
            if (document.getElementById("gg-level-dump") == null) {
                var fields = document.createElement("div");
                fields.setAttribute("id", "gg-level-dump");
                document.body.appendChild(fields);
            }
            document.getElementById("gg-level-dump").textContent = "\"use strict\";\n\nGame.Levels.push(" + JSON.stringify(Game.dumpLevel(state), undefined, 4) + ");";
        }
    },
    tick: function (state, frameTime, keyboardInput, mouseInput) {
        if (state.loadLock > 0)
            return;

        state.time += frameTime;

        var forceEditRefresh = false;

        if (state.level.state === "intro") {
            if (keyboardInput.down) {
                keyboardInput.down = false;
                if (state.intro.activeMenu === "top")
                    state.intro.activeMenu = "middle";
                else if (state.intro.activeMenu === "middle")
                    state.intro.activeMenu = "bottom";
            }
            if (keyboardInput.up) {
                keyboardInput.up = false;
                if (state.intro.activeMenu === "bottom")
                    state.intro.activeMenu = "middle";
                else if (state.intro.activeMenu === "middle")
                    state.intro.activeMenu = "top";
            }
            if (keyboardInput.enter && state.intro.activeMenu === "bottom") {
                keyboardInput.enter = false;
                state.level.nextLevel = parseInt(GG.Cookies.get('detached_level', '0'));
                Game.loadLevel(state, false);
                GG.Sounds.playSound(state.audio, state.sounds.win);
            }
        } else {
            var player = state.player;

            if (state.level.state === "win" && (state.time - state.level.winTime) > 1) {
                state.level.nextLevel = (state.level.nextLevel + 1) % Game.Levels.length;
                GG.Cookies.set("detached_level", state.level.nextLevel);
                if (state.level.nextLevel == 0) {
                    state.level.state = "intro";
                    state.player = Game.makeTriangle(state.player.cellX, state.player.cellY, state.player.top.color, state.player.top.color, state.player.top.color, false, undefined, state, false);
                    state.camera.targetX = state.player.x - 0.7 * state.level.cellSize;
                    state.camera.targetY = state.player.y + 0.5 * state.level.cellSize;
                    state.camera.targetScale = 512 / Game.config.canvasWidth;
                    state.intro.wasActive = true;
                    state.intro.introTime = state.time;
                } else {
                    Game.loadLevel(state, false);
                }
            }

            if (state.level.state === "load" && (state.time - state.level.loadTime) > 1) {
                state.level.state = "move";
                state.camera.targetX = state.level.centerX;
                state.camera.targetY = state.level.centerY;
                state.camera.targetScale = 1280 / Game.config.canvasWidth;
            }

            player.x = player.targetX * 0.2 + player.x * 0.8;
            player.y = player.targetY * 0.2 + player.y * 0.8;
            state.npcs.forEach(function (npc) {
                npc.x = npc.targetX * 0.2 + npc.x * 0.8;
                npc.y = npc.targetY * 0.2 + npc.y * 0.8;
            });

            if (state.level.state !== "intro" && state.level.state !== "win" && state.level.state !== "load") {
                if (keyboardInput.reload) {
                    keyboardInput.reload = false;
                    Game.loadLevel(state, true);
                }
            }

            if (state.level.state !== "intro" && state.level.state !== "win" && state.level.state !== "load") {
                if (Math.abs(player.x - player.targetX) < 2 && Math.abs(player.y - player.targetY) < 2) {
                    player.x = player.targetX;
                    player.y = player.targetY;

                    if (state.level.state !== "win" && state.level.index[player.cellX + "_" + player.cellY].type === "exit") {
                        state.level.state = "win";
                        state.camera.targetX = player.x;
                        state.camera.targetY = player.y;
                        state.camera.targetScale = 512 / Game.config.canvasWidth;
                        state.level.winTime = state.time;
                        GG.Sounds.playSound(state.audio, state.sounds.win);
                    }

                    state.npcs.forEach(function (npc) {
                        if (npc.message !== undefined) {
                            npc.message.targetOpacity = 0;
                            if (npc.message.opacity < 0.1)
                                npc.message.scale = 0;
                        }
                    });

                    var currentCellIndex = player.cellX + "_" + player.cellY;
                    var currentCell = state.level.index[currentCellIndex];
                    if (currentCell.type == "trap" && currentCell.isOpen) {
                        if (player.isDead) {
                            if (state.time - player.deadTime > 1.4)
                                Game.loadLevel(state, true);
                        } else {
                            player.isDead = true;
                            player.deadTime = state.time;
                            setTimeout(function() {
                                GG.Sounds.playSound(state.audio, state.sounds.fall);
                            }, 200);
                        }
                    } else {
                        var neighbors = [
                            {x: player.cellX - 1, y: player.cellY},
                            {x: player.cellX + 1, y: player.cellY},
                            {x: player.cellX, y: player.cellY - 1},
                            {x: player.cellX, y: player.cellY + 1}
                        ];
                        var isNearExit = false;
                        neighbors.forEach(function (neighbor) {
                            var cellIndex = neighbor.x + "_" + neighbor.y;
                            if (cellIndex in state.level.index) {
                                var cell = state.level.index[cellIndex];
                                if (cell.type === "exit") {
                                    isNearExit = true;
                                    state.camera.targetX = state.level.centerX * 0.9 + player.x * 0.1;
                                    state.camera.targetY = state.level.centerY * 0.9 + player.y * 0.1;
                                    state.camera.targetScale = 1280 / Game.config.canvasWidth;
                                    if (cell.isOpen) {
                                        if (player.bottom.color !== player.middle.color || player.middle.color !== player.top.color)
                                            cell.isOpen = false;
                                    }
                                } else if (cell.occupiedBy !== undefined && cell.occupiedBy.message !== undefined) {
                                    cell.occupiedBy.message.targetScale = 1;
                                    cell.occupiedBy.message.targetOpacity = 1;
                                }
                            }
                        });
                        if (!isNearExit && state.level.state === "move") {
                            state.camera.targetX = state.level.centerX;
                            state.camera.targetY = state.level.centerY;
                            state.camera.targetScale = 1280 / Game.config.canvasWidth;
                        }
                        if (player.nextMoves.length > 0) {
                            var nextMove = player.nextMoves[0];
                            var nextX = (nextMove.x + 0.5) * state.level.cellSize;
                            var nextY = (nextMove.y + 0.5) * state.level.cellSize;
                            if (nextMove.occupiedBy !== undefined && !nextMove.occupiedBy.isDead) {
                                if (!nextMove.occupiedBy.isTalker && !nextMove.occupiedBy.isDead) {
                                    state.camera.targetX = 0.5 * (player.x + nextX);
                                    state.camera.targetY = 0.5 * (player.y + nextY);
                                    state.camera.targetScale = 700 / Game.config.canvasWidth;
                                    state.level.state = "swap";
                                    state.level.swapNpc = nextMove.occupiedBy;
                                }
                            } else {
                                GG.Sounds.playSound(state.audio, state.sounds.walk);
                                if (currentCell.type === "trap")
                                    currentCell.isOpen = true;
                                var nextCell = state.level.index[nextMove.x + "_" + nextMove.y];
                                var isMovingOntoExit = nextMove.type === "exit" && nextCell.isOpen;
                                if (nextMove.type === "ground" || nextMove.type === "trap" || nextMove.type === "ice" || (isMovingOntoExit && !state.editable)) {
                                    forceEditRefresh = true;
                                    player.cellX = nextMove.x;
                                    player.cellY = nextMove.y;
                                    player.targetX = nextX;
                                    player.targetY = nextY;
                                }
                                if (nextMove.type === "exit" && !nextCell.isOpen)
                                    GG.Sounds.playSound(state.audio, state.sounds.blocked);
                            }
                            player.nextMoves.splice(0, 1);

                            state.level.cells.forEach(function (cell) {
                                if (cell.type === "exit" && !cell.isOpen) {
                                    cell.isOpen = true;
                                }
                            });
                        }
                    }
                }
            }
            if (state.level.state === "move") {
                var movementX = 0;
                var movementY = 0;
                if (keyboardInput.left) {
                    movementX -= 1;
                    keyboardInput.left = false;
                }
                if (keyboardInput.right) {
                    movementX += 1;
                    keyboardInput.right = false;
                }
                if (keyboardInput.down) {
                    movementY -= 1;
                    keyboardInput.down = false;
                }
                if (keyboardInput.up) {
                    movementY += 1;
                    keyboardInput.up = false;
                }
                if (movementX !== 0)
                    movementY = 0;
                if (movementX !== 0 || movementY !== 0) {
                    var cell;
                    var lastCell;
                    var isFirstOfSlide = true;
                    do {
                        cell = undefined;
                        if (player.nextMoves.length > 0)
                            lastCell = player.nextMoves[player.nextMoves.length - 1];
                        else
                            lastCell = {x: player.cellX, y: player.cellY, occupiedBy: undefined, type: undefined};
                        if (lastCell.occupiedBy === undefined || lastCell.type === "exit") { // TODO: fix microbug here on level end
                            var newCell = {
                                x: lastCell.x + movementX,
                                y: lastCell.y + movementY,
                                occupiedBy: undefined,
                                type: undefined
                            };
                            var newCellIndex = newCell.x + "_" + newCell.y;
                            if (state.level.index.hasOwnProperty(newCellIndex)) {
                                cell = state.level.index[newCellIndex];
                                newCell.type = cell.type;
                                if (cell.type === "ground" || cell.type === "exit" || cell.type === "trap" || (cell.type === "ice" && (!cell.occupiedBy || isFirstOfSlide))) {
                                    newCell.occupiedBy = cell.occupiedBy;
                                    player.nextMoves.push(newCell);
                                } else {
                                    cell = undefined;
                                }
                            }
                        }
                        isFirstOfSlide = false;
                    } while (cell !== undefined && cell.type === "ice");
                }
            } else if (state.level.state === "swap") {
                if (keyboardInput.cancel) {
                    keyboardInput.cancel = false;
                    state.camera.targetX = state.level.centerX;
                    state.camera.targetY = state.level.centerY;
                    state.camera.targetScale = 1280 / Game.config.canvasWidth;
                    state.level.state = "move";
                } else if (keyboardInput.enter) {
                    GG.Sounds.playSound(state.audio, state.sounds.swap);
                    var npc = state.level.swapNpc;

                    var tmp = player[state.level.swapPart].color;
                    player[state.level.swapPart].color = npc[state.level.swapPart].color;
                    npc[state.level.swapPart].color = tmp;

                    var npcCell = state.level.index[npc.cellX + "_" + npc.cellY];
                    var playerCell = state.level.index[player.cellX + "_" + player.cellY];
                    npcCell.occupiedBy = undefined;
                    playerCell.occupiedBy = npc;
                    ["targetX", "targetY", "cellX", "cellY"].forEach(function (key) {
                        var tmp = player[key];
                        player[key] = npc[key];
                        npc[key] = tmp;
                    });
                    if (npcCell.type === "trap") {
                        npcCell.isOpen = true;
                        player.isDead = true;
                        player.deadTime = state.time;
                        setTimeout(function() {
                            GG.Sounds.playSound(state.audio, state.sounds.fall);
                        }, 200);
                    }
                    if (playerCell.type === "trap") {
                        playerCell.isOpen = true;
                        npc.isDead = true;
                        npc.deadTime = state.time;
                        setTimeout(function() {
                            GG.Sounds.playSound(state.audio, state.sounds.fall);
                        }, 200);
                    }

                    state.camera.targetX = state.level.centerX;
                    state.camera.targetY = state.level.centerY;
                    state.camera.targetScale = 1280 / Game.config.canvasWidth;
                    state.level.state = "move";
                    forceEditRefresh = true;
                } else {
                    if (keyboardInput.up) {
                        keyboardInput.up = false;
                        if (state.level.swapPart === "bottom")
                            state.level.swapPart = "middle";
                        else if (state.level.swapPart === "middle")
                            state.level.swapPart = "top";
                    }
                    if (keyboardInput.down) {
                        keyboardInput.down = false;
                        if (state.level.swapPart === "middle")
                            state.level.swapPart = "bottom";
                        else if (state.level.swapPart === "top")
                            state.level.swapPart = "middle";
                    }
                }
            }

            for (var i = 0; i < state.npcs.length; ++i)
                updateTriangle(state.npcs[i]);
        }

        updateTriangle(state.player);

        function updateTriangle(triangle) {
            if (Math.random() > 0.995) {
                triangle.eyeCenter.targetX = triangle.eyeCenter.baseX + Math.random() * 8 - 4;
                triangle.eyeCenter.targetY = triangle.eyeCenter.baseY + Math.random() * 8 - 4;
            }
            if (triangle.isDead && state.time - triangle.deadTime > 0.2) {
                triangle.angle += 0.01;
                triangle.scale *= 0.99;
            } else {
                triangle.eyeCenter.x = triangle.eyeCenter.targetX * 0.1 + triangle.eyeCenter.x * 0.9;
                triangle.eyeCenter.y = triangle.eyeCenter.targetY * 0.1 + triangle.eyeCenter.y * 0.9;
            }

            triangle.transform = GG.Transforms.createTRS(triangle.x, triangle.y, triangle.angle, triangle.scale);
            triangle.shadow.transform = GG.Transforms.multiply(
                triangle.transform,
                GG.Transforms.createTRS(triangle.shadow.x, triangle.shadow.y, triangle.shadow.angle, triangle.shadow.scale));
            triangle.eye.transform = GG.Transforms.multiply(
                triangle.transform,
                GG.Transforms.createTRS(triangle.eye.x, triangle.eye.y, triangle.eye.angle, triangle.eye.scale));
            triangle.eyeCenter.transform = GG.Transforms.multiply(
                triangle.transform,
                GG.Transforms.createTRS(triangle.eyeCenter.x, triangle.eyeCenter.y, triangle.eyeCenter.angle, triangle.eyeCenter.scale));
            triangle.bottom.transform = GG.Transforms.multiply(
                triangle.transform,
                GG.Transforms.createTRS(triangle.bottom.x, triangle.bottom.y, triangle.bottom.angle, triangle.bottom.scale));
            triangle.middle.transform = GG.Transforms.multiply(
                triangle.transform,
                GG.Transforms.createTRS(triangle.middle.x, triangle.middle.y, triangle.middle.angle, triangle.middle.scale));
            triangle.top.transform = GG.Transforms.multiply(
                triangle.transform,
                GG.Transforms.createTRS(triangle.top.x, triangle.top.y, triangle.top.angle, triangle.top.scale));

            if (triangle.message != undefined) {
                triangle.message.scale = triangle.message.targetScale * 0.2 + triangle.message.scale * 0.8;
                triangle.message.opacity = triangle.message.targetOpacity * 0.05 + triangle.message.opacity * 0.95;
                triangle.message.transform = GG.Transforms.multiply(
                    triangle.transform,
                    GG.Transforms.createTRS(triangle.message.x, triangle.message.y, triangle.message.angle, triangle.message.scale));
            }
        }

        var camera = state.camera;
        camera.x = camera.targetX * 0.1 + camera.x * 0.9;
        camera.y = camera.targetY * 0.1 + camera.y * 0.9;
        camera.scale = camera.targetScale * 0.1 + camera.scale * 0.9;

        if (keyboardInput.edit) {
            keyboardInput.edit = false;
            state.editable = !state.editable;
            forceEditRefresh = true;
        }
        if (state.editable)
            Game.editLevel(state, keyboardInput, mouseInput, forceEditRefresh);
        else if (document.getElementById("gg-level-dump") !== null) {
            var dump = document.getElementById("gg-level-dump");
            dump.parentNode.removeChild(dump);
        }
    },
    draw: function (state) {
        // TODO: IE doesn't support VAO, must change drawing code :(
        var gl = state.gl;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clearColor(state.background[0], state.background[1], state.background[2], 1);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (state.loadLock > 0)
            return;

        if (state.shader.program !== undefined) {
            gl.useProgram(state.shader.program);
            gl.uniform1f(state.shader.uniforms.time, state.time);
            gl.uniform4f(state.shader.uniforms.tint, 1, 1, 1, 1);
            if (state.textures.sample !== undefined) {
                gl.uniform1i(state.shader.uniforms.sampler, 0);
                gl.activeTexture(gl.TEXTURE0);
            }

            var view = new Float32Array(9);
            var camera = state.camera;
            var cameraTransform = GG.Transforms.createTRSInverse(camera.x, camera.y, camera.angle, camera.scale);
            var projection = GG.Transforms.createOrtho(gl.canvas.clientWidth, gl.canvas.clientHeight);
            cameraTransform = GG.Transforms.multiply(projection, cameraTransform);
            GG.Transforms.toMat3(cameraTransform, view);

            gl.uniformMatrix3fv(state.shader.uniforms.view, false, view);
            var model = new Float32Array(9);

            var bcakgroundTransform = GG.Transforms.createTRS(camera.x, camera.y, 0, camera.scale);
            GG.Transforms.toMat3(bcakgroundTransform, model);
            gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
            GG.Meshes.bindMesh(gl, state.meshes.quad_1024);
            if (state.level.state === "intro")
                gl.uniform4f(state.shader.uniforms.tint, 1, 1, 1, Math.max(0, Math.min(1, state.time - state.intro.introTime)));
            else
                gl.uniform4f(state.shader.uniforms.tint, 1, 1, 1, 1);
            gl.bindTexture(gl.TEXTURE_2D, state.textures.background);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            if (state.level.state === "intro") {
                GG.Meshes.bindMesh(gl, state.meshes.menu_text);
                gl.bindTexture(gl.TEXTURE_2D, state.textures["menu_" + state.intro.activeMenu]);
                gl.uniform4f(state.shader.uniforms.tint, 1, 1, 1, Math.max(0, Math.min(1, state.time - state.intro.introTime)));
                var menuTransform = GG.Transforms.createTRS(state.player.x - 0.5 *state.level.cellSize+ 0.2 * state.level.cellSize, state.player.y - 0.5 *state.level.cellSize +0.6 * state.level.cellSize, 0, 1);
                GG.Transforms.toMat3(menuTransform, model);
                gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                GG.Meshes.bindMesh(gl, state.meshes.quad_128);
                drawTriangle(state.player, state.intro.activeMenu, true);
            } else {
                GG.Meshes.bindMesh(gl, state.meshes.quad_128);
                for (var i = 0; i < state.level.cells.length; ++i) {
                    var cell = state.level.cells[i];
                    if (cell.type == "exit") {
                        if (cell.isOpen)
                            gl.bindTexture(gl.TEXTURE_2D, state.textures.exit_open);
                        else
                            gl.bindTexture(gl.TEXTURE_2D, state.textures.exit_closed);
                        GG.Transforms.toMat3(cell.transform, model);
                        gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
                        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    }
                }

                GG.Meshes.bindMesh(gl, state.meshes.quad_128);
                gl.bindTexture(gl.TEXTURE_2D, state.textures.ground);
                for (i = 0; i < state.level.cells.length; ++i) {
                    cell = state.level.cells[i];
                    if (cell.type == "ground") {
                        GG.Transforms.toMat3(cell.transform, model);
                        gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
                        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    }
                }

                GG.Meshes.bindMesh(gl, state.meshes.quad_128);
                gl.bindTexture(gl.TEXTURE_2D, state.textures.ice);
                for (i = 0; i < state.level.cells.length; ++i) {
                    cell = state.level.cells[i];
                    if (cell.type == "ice") {
                        GG.Transforms.toMat3(cell.transform, model);
                        gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
                        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    }
                }

                GG.Meshes.bindMesh(gl, state.meshes.quad_128);
                gl.bindTexture(gl.TEXTURE_2D, state.textures.trap_closed);
                for (i = 0; i < state.level.cells.length; ++i) {
                    cell = state.level.cells[i];
                    if (cell.type == "trap" && !cell.isOpen) {
                        GG.Transforms.toMat3(cell.transform, model);
                        gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
                        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    }
                }

                GG.Meshes.bindMesh(gl, state.meshes.quad_128);
                gl.bindTexture(gl.TEXTURE_2D, state.textures.trap_open);
                for (i = 0; i < state.level.cells.length; ++i) {
                    cell = state.level.cells[i];
                    if (cell.type == "trap" && cell.isOpen) {
                        GG.Transforms.toMat3(cell.transform, model);
                        gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
                        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    }
                }

                GG.Meshes.bindMesh(gl, state.meshes.quad_128);
                for (i = 0; i < state.npcs.length; ++i) {
                    var npc = state.npcs[i];
                    if (!npc.isTalker)
                        drawTriangle(npc, state.level.state === "swap" && npc == state.level.swapNpc ? state.level.swapPart : undefined, false);
                }

                if (state.level.state !== "win")
                    drawTriangle(state.player, state.level.state === "swap" ? state.level.swapPart : undefined, true);

                GG.Meshes.bindMesh(gl, state.meshes.quad_256);
                gl.bindTexture(gl.TEXTURE_2D, state.textures.wall);
                for (i = 0; i < state.level.cells.length; ++i) {
                    cell = state.level.cells[i];
                    if (cell.type == "wall") {
                        GG.Transforms.toMat3(cell.transform, model);
                        gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
                        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    }
                }

                GG.Meshes.bindMesh(gl, state.meshes.quad_128);
                for (i = 0; i < state.npcs.length; ++i) {
                    npc = state.npcs[i];
                    if (npc.isTalker)
                        drawTriangle(npc, undefined, false);
                }

                for (i = 0; i < state.npcs.length; ++i) {
                    npc = state.npcs[i];
                    if (npc.isTalker && npc.message !== undefined) {
                        GG.Meshes.bindMesh(gl, state.meshes.message);
                        gl.bindTexture(gl.TEXTURE_2D, state.textures[npc.message.texture]);
                        GG.Transforms.toMat3(npc.message.transform, model);
                        gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
                        gl.uniform4fv(state.shader.uniforms.tint, [1, 1, 1, npc.message.opacity]);
                        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    }
                }

                if (state.level.state === "win" || state.level.state === "load") {
                    GG.Transforms.toMat3(state.player.transform, model);
                    gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
                    GG.Meshes.bindMesh(gl, state.meshes.quad_4096);
                    if (state.level.state === "win")
                        gl.uniform4f(state.shader.uniforms.tint, state.background[0], state.background[1], state.background[2], Math.min(1.0, state.time - state.level.winTime));
                    else
                        gl.uniform4f(state.shader.uniforms.tint, state.background[0], state.background[1], state.background[2], 1.0 - Math.min(1.0, state.time - state.level.loadTime));

                    gl.bindTexture(gl.TEXTURE_2D, state.textures.fill);
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

                    GG.Meshes.bindMesh(gl, state.meshes.quad_128);
                    drawTriangle(state.player, state.level.state === "swap" ? state.level.swapPart : undefined, true);
                }

                if (state.editable) {
                    var transform = GG.Transforms.createTRS(
                        -0.5 * Game.config.canvasWidth * camera.scale + camera.x,
                        0.5 * Game.config.canvasHeight * camera.scale + camera.y, 0, camera.scale);

                    GG.Transforms.toMat3(transform, model);
                    gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
                    GG.Meshes.bindMesh(gl, state.meshes.edit_mode);
                    gl.bindTexture(gl.TEXTURE_2D, state.textures.edit_mode);
                    gl.uniform4f(state.shader.uniforms.tint, 1, 1, 1, 1);
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                }
            }
        }

        function drawTriangle(triangle, highlightedPart, isPlayer) {
            var bottomColor = state.colors[triangle.bottom.color];
            var middleColor = state.colors[triangle.middle.color];
            var topColor = state.colors[triangle.top.color];

            GG.Transforms.toMat3(triangle.shadow.transform, model);
            gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
            gl.uniform4f(state.shader.uniforms.tint, 1, 1, 1, 1);
            gl.bindTexture(gl.TEXTURE_2D, state.textures.triangle_shadow);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            GG.Transforms.toMat3(triangle.eye.transform, model);
            gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
            gl.uniform4f(state.shader.uniforms.tint, 1, 1, 1, 1);
            gl.bindTexture(gl.TEXTURE_2D, state.textures.triangle_eye);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            GG.Transforms.toMat3(triangle.eyeCenter.transform, model);
            gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
            gl.uniform4f(state.shader.uniforms.tint, 1, 1, 1, 1);
            if (isPlayer)
                gl.bindTexture(gl.TEXTURE_2D, state.textures.triangle_eye_center);
            else
                gl.bindTexture(gl.TEXTURE_2D, state.textures.triangle_eye_center_npc);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            GG.Transforms.toMat3(triangle.bottom.transform, model);
            gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
            if (highlightedPart === "bottom")
                gl.uniform4fv(state.shader.uniforms.tint, Game.lerp4(bottomColor, [1, 1, 1, 1], 0.5 + 0.25 * Math.sin(8 * state.time)));
            else
                gl.uniform4fv(state.shader.uniforms.tint, triangle.isDead ? Game.lerp4(bottomColor, [0, 0, 0, 1], state.time - triangle.deadTime) : bottomColor);
            gl.bindTexture(gl.TEXTURE_2D, state.textures.triangle_bottom_mask);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.uniform4f(state.shader.uniforms.tint, 1, 1, 1, 1);
            gl.bindTexture(gl.TEXTURE_2D, state.textures.triangle_bottom_overlay);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            GG.Transforms.toMat3(triangle.middle.transform, model);
            gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
            if (highlightedPart === "middle")
                gl.uniform4fv(state.shader.uniforms.tint, Game.lerp4(middleColor, [1, 1, 1, 1], 0.5 + 0.25 * Math.sin(8 * state.time)));
            else
                gl.uniform4fv(state.shader.uniforms.tint, triangle.isDead ? Game.lerp4(middleColor, [0, 0, 0, 1], state.time - triangle.deadTime) : middleColor);
            gl.bindTexture(gl.TEXTURE_2D, state.textures.triangle_middle_mask);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.uniform4f(state.shader.uniforms.tint, 1, 1, 1, 1);
            gl.bindTexture(gl.TEXTURE_2D, state.textures.triangle_middle_overlay);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            GG.Transforms.toMat3(triangle.top.transform, model);
            gl.uniformMatrix3fv(state.shader.uniforms.model, false, model);
            if (highlightedPart === "top")
                gl.uniform4fv(state.shader.uniforms.tint, Game.lerp4(topColor, [1, 1, 1, 1], 0.5 + 0.25 * Math.sin(8 * state.time)));
            else
                gl.uniform4fv(state.shader.uniforms.tint, triangle.isDead ? Game.lerp4(topColor, [0, 0, 0, 1], state.time - triangle.deadTime) : topColor);
            gl.bindTexture(gl.TEXTURE_2D, state.textures.triangle_top_mask);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.uniform4f(state.shader.uniforms.tint, 1, 1, 1, 1);
            gl.bindTexture(gl.TEXTURE_2D, state.textures.triangle_top_overlay);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

    }
};
