/*!
 * MiniWitness 1.1.5
 * Copyright 2026 hi2ma-bu4
 * Licensed under the Apache License, Version 2.0
 * http://www.apache.org/licenses/LICENSE-2.0
 */

// src/types.ts
var Direction = /* @__PURE__ */ ((Direction2) => {
  Direction2[Direction2["Up"] = 0] = "Up";
  Direction2[Direction2["Right"] = 1] = "Right";
  Direction2[Direction2["Down"] = 2] = "Down";
  Direction2[Direction2["Left"] = 3] = "Left";
  return Direction2;
})(Direction || {});
var CellType = /* @__PURE__ */ ((CellType2) => {
  CellType2[CellType2["None"] = 0] = "None";
  CellType2[CellType2["Square"] = 1] = "Square";
  CellType2[CellType2["Star"] = 2] = "Star";
  CellType2[CellType2["Tetris"] = 3] = "Tetris";
  CellType2[CellType2["TetrisRotated"] = 4] = "TetrisRotated";
  CellType2[CellType2["Eraser"] = 5] = "Eraser";
  return CellType2;
})(CellType || {});
var EdgeType = /* @__PURE__ */ ((EdgeType2) => {
  EdgeType2[EdgeType2["Normal"] = 0] = "Normal";
  EdgeType2[EdgeType2["Broken"] = 1] = "Broken";
  EdgeType2[EdgeType2["Absent"] = 2] = "Absent";
  EdgeType2[EdgeType2["Hexagon"] = 3] = "Hexagon";
  return EdgeType2;
})(EdgeType || {});
var NodeType = /* @__PURE__ */ ((NodeType2) => {
  NodeType2[NodeType2["Normal"] = 0] = "Normal";
  NodeType2[NodeType2["Start"] = 1] = "Start";
  NodeType2[NodeType2["End"] = 2] = "End";
  return NodeType2;
})(NodeType || {});
var Color = {
  None: 0,
  Black: 1,
  White: 2,
  Red: 3,
  Blue: 4
};

// src/grid.ts
var Grid = class _Grid {
  rows;
  cols;
  // データマトリクス
  cells = [];
  hEdges = [];
  // 横棒
  vEdges = [];
  // 縦棒
  nodes = [];
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.initializeGrid();
  }
  initializeGrid() {
    this.cells = Array.from({ length: this.rows }, () => Array.from({ length: this.cols }, () => ({ type: 0 /* None */, color: Color.None })));
    this.hEdges = Array.from({ length: this.rows + 1 }, () => Array.from({ length: this.cols }, () => ({ type: 0 /* Normal */ })));
    this.vEdges = Array.from({ length: this.rows }, () => Array.from({ length: this.cols + 1 }, () => ({ type: 0 /* Normal */ })));
    this.nodes = Array.from({ length: this.rows + 1 }, () => Array.from({ length: this.cols + 1 }, () => ({ type: 0 /* Normal */ })));
  }
  export() {
    return JSON.parse(
      JSON.stringify({
        rows: this.rows,
        cols: this.cols,
        cells: this.cells,
        vEdges: this.vEdges,
        hEdges: this.hEdges,
        nodes: this.nodes
      })
    );
  }
  static fromData(data) {
    const grid = new _Grid(data.rows, data.cols);
    grid.cells = data.cells;
    grid.vEdges = data.vEdges;
    grid.hEdges = data.hEdges;
    grid.nodes = data.nodes;
    return grid;
  }
};

// src/validator.ts
var PuzzleValidator = class {
  /**
   * 与えられたグリッドと回答パスが正当かどうかを検証する
   * @param grid パズルのグリッドデータ
   * @param solution 回答パス
   * @returns 検証結果（正誤、エラー理由、無効化された記号など）
   */
  validate(grid, solution) {
    const path = solution.points;
    if (path.length < 2) return { isValid: false, errorReason: "Path too short" };
    const start = path[0];
    const end = path[path.length - 1];
    if (grid.nodes[start.y][start.x].type !== 1 /* Start */) return { isValid: false, errorReason: "Must start at Start Node" };
    if (grid.nodes[end.y][end.x].type !== 2 /* End */) return { isValid: false, errorReason: "Must end at End Node" };
    const visitedNodes = /* @__PURE__ */ new Set();
    visitedNodes.add(`${start.x},${start.y}`);
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];
      const dist = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
      if (dist !== 1) return { isValid: false, errorReason: "Invalid jump in path" };
      const key = `${p2.x},${p2.y}`;
      if (visitedNodes.has(key)) return { isValid: false, errorReason: "Self-intersecting path" };
      visitedNodes.add(key);
      if (this.isBrokenEdge(grid, p1, p2)) return { isValid: false, errorReason: "Passed through broken edge" };
    }
    const regions = this.calculateRegions(grid, path);
    const missedHexagons = this.getMissedHexagons(grid, path);
    return this.validateWithErasers(grid, regions, missedHexagons);
  }
  /**
   * 二点間が断線（Broken or Absent）しているか確認する
   */
  isBrokenEdge(grid, p1, p2) {
    let type;
    if (p1.x === p2.x) {
      const y = Math.min(p1.y, p2.y);
      type = grid.vEdges[y][p1.x].type;
    } else {
      const x = Math.min(p1.x, p2.x);
      type = grid.hEdges[p1.y][x].type;
    }
    return type === 1 /* Broken */ || type === 2 /* Absent */;
  }
  /**
   * 二点間が Absent（存在しない）エッジか確認する
   */
  isAbsentEdge(grid, p1, p2) {
    if (p1.x === p2.x) {
      const y = Math.min(p1.y, p2.y);
      return grid.vEdges[y][p1.x].type === 2 /* Absent */;
    } else {
      const x = Math.min(p1.x, p2.x);
      return grid.hEdges[p1.y][x].type === 2 /* Absent */;
    }
  }
  /**
   * 回答パスが通過しなかった六角形エッジをリストアップする
   */
  getMissedHexagons(grid, path) {
    const pathEdges = /* @__PURE__ */ new Set();
    for (let i = 0; i < path.length - 1; i++) {
      pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
    }
    const missed = [];
    for (let r = 0; r <= grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (grid.hEdges[r][c].type === 3 /* Hexagon */) {
          const key = this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r });
          if (!pathEdges.has(key)) missed.push({ type: "h", r, c });
        }
      }
    }
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c <= grid.cols; c++) {
        if (grid.vEdges[r][c].type === 3 /* Hexagon */) {
          const key = this.getEdgeKey({ x: c, y: r }, { x: c, y: r + 1 });
          if (!pathEdges.has(key)) missed.push({ type: "v", r, c });
        }
      }
    }
    return missed;
  }
  /**
   * テトラポッド（エラー削除）を考慮してパズルの各制約を検証する
   */
  validateWithErasers(grid, regions, missedHexagons) {
    const regionResults = [];
    let allRegionsPossiblyValid = true;
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      const erasers = region.filter((p) => grid.cells[p.y][p.x].type === 5 /* Eraser */);
      const otherMarks = region.filter((p) => grid.cells[p.y][p.x].type !== 0 /* None */ && grid.cells[p.y][p.x].type !== 5 /* Eraser */);
      const adjacentMissedHexagons = [];
      for (let j = 0; j < missedHexagons.length; j++) {
        if (this.isHexagonAdjacentToRegion(grid, missedHexagons[j], region)) adjacentMissedHexagons.push(j);
      }
      const possible = this.getPossibleErasures(grid, region, erasers, otherMarks, adjacentMissedHexagons);
      if (possible.length === 0) {
        allRegionsPossiblyValid = false;
        const bestEffort = this.getBestEffortErasures(grid, region, erasers, otherMarks, adjacentMissedHexagons);
        regionResults.push([bestEffort]);
      } else {
        possible.sort((a, b) => {
          const costA = a.invalidatedCells.length + a.invalidatedHexagons.length;
          const costB = b.invalidatedCells.length + b.invalidatedHexagons.length;
          return costA - costB;
        });
        regionResults.push(possible);
      }
    }
    if (allRegionsPossiblyValid) {
      const assignment = this.findGlobalAssignment(regionResults, missedHexagons.length);
      if (assignment) {
        return {
          isValid: true,
          invalidatedCells: assignment.invalidatedCells,
          invalidatedEdges: assignment.invalidatedHexIndices.map((idx) => missedHexagons[idx])
        };
      }
    }
    const errorCells = [];
    const invalidatedCells = [];
    const invalidatedHexIndices = /* @__PURE__ */ new Set();
    for (const options of regionResults) {
      const best = options[0];
      errorCells.push(...best.errorCells);
      invalidatedCells.push(...best.invalidatedCells);
      for (const idx of best.invalidatedHexagons) invalidatedHexIndices.add(idx);
    }
    const errorEdges = [];
    for (let i = 0; i < missedHexagons.length; i++) {
      if (!invalidatedHexIndices.has(i)) {
        errorEdges.push(missedHexagons[i]);
      }
    }
    return {
      isValid: false,
      errorReason: "Constraints failed",
      errorCells,
      errorEdges,
      invalidatedCells,
      invalidatedEdges: Array.from(invalidatedHexIndices).map((idx) => missedHexagons[idx])
    };
  }
  /**
   * 指定されたエッジが特定の区画に隣接しているか確認する
   */
  isHexagonAdjacentToRegion(grid, hex, region) {
    const regionCells = new Set(region.map((p) => `${p.x},${p.y}`));
    if (hex.type === "h") {
      if (hex.r > 0 && regionCells.has(`${hex.c},${hex.r - 1}`)) return true;
      if (hex.r < grid.rows && regionCells.has(`${hex.c},${hex.r}`)) return true;
    } else {
      if (hex.c > 0 && regionCells.has(`${hex.c - 1},${hex.r}`)) return true;
      if (hex.c < grid.cols && regionCells.has(`${hex.c},${hex.r}`)) return true;
    }
    return false;
  }
  /**
   * 区画内のエラー削除可能な全パターンを取得する
   */
  getPossibleErasures(grid, region, erasers, otherMarks, adjacentMissedHexagons) {
    const results = [];
    const numErasers = erasers.length;
    if (numErasers === 0) {
      const errorCells = this.getRegionErrors(grid, region, []);
      if (errorCells.length === 0 && adjacentMissedHexagons.length === 0) {
        results.push({ invalidatedCells: [], invalidatedHexagons: [], isValid: true, errorCells: [] });
      }
      return results;
    }
    const itemsToNegate = [...otherMarks.map((p) => ({ type: "cell", pos: p })), ...adjacentMissedHexagons.map((idx) => ({ type: "hex", index: idx }))];
    const initiallyValid = this.getRegionErrors(grid, region, []).length === 0 && adjacentMissedHexagons.length === 0;
    for (let N = 0; N <= numErasers; N++) {
      const negatedEraserCombinations = this.getNCombinations(erasers, N);
      for (const negatedErasers of negatedEraserCombinations) {
        const negatedErasersSet = new Set(negatedErasers.map((e) => `${e.x},${e.y}`));
        const activeErasers = erasers.filter((e) => !negatedErasersSet.has(`${e.x},${e.y}`));
        for (let K = 0; K <= itemsToNegate.length; K++) {
          if (activeErasers.length !== N + K) continue;
          const itemCombinations = this.getNCombinations(itemsToNegate, K);
          for (const negatedItems of itemCombinations) {
            const negatedCells = negatedItems.filter((it) => it.type === "cell").map((it) => it.pos);
            const negatedHexIndices = negatedItems.filter((it) => it.type === "hex").map((it) => it.index);
            const errorCells = this.getRegionErrors(grid, region, [...negatedCells, ...negatedErasers]);
            const isValid = errorCells.length === 0;
            if (isValid) {
              let isUseful = true;
              if (initiallyValid) {
                if (K > 0) isUseful = false;
              } else {
                for (let i = 0; i < negatedItems.length; i++) {
                  const subset = [...negatedItems.slice(0, i), ...negatedItems.slice(i + 1)];
                  const subsetCells = subset.filter((it) => it.type === "cell").map((it) => it.pos);
                  const subsetHexIndices = new Set(subset.filter((it) => it.type === "hex").map((it) => it.index));
                  const allHexSatisfied = adjacentMissedHexagons.every((idx) => subsetHexIndices.has(idx));
                  if (this.getRegionErrors(grid, region, subsetCells).length === 0 && allHexSatisfied) {
                    isUseful = false;
                    break;
                  }
                }
              }
              if (isUseful) {
                results.push({
                  invalidatedCells: [...negatedCells, ...negatedErasers],
                  invalidatedHexagons: negatedHexIndices,
                  isValid: true,
                  errorCells: []
                });
              }
            }
          }
        }
      }
    }
    return results;
  }
  /**
   * エラーが解消できなかった場合のベストエフォートな削除（ランダムに一つ削除）を取得する
   */
  getBestEffortErasures(grid, region, erasers, otherMarks, adjacentMissedHexagons) {
    const itemsToNegate = [...otherMarks.map((p) => ({ type: "cell", pos: p })), ...adjacentMissedHexagons.map((idx) => ({ type: "hex", index: idx }))];
    const naturalErrors = this.getRegionErrors(grid, region, []);
    const initiallyValid = naturalErrors.length === 0 && adjacentMissedHexagons.length === 0;
    if (initiallyValid) {
      return {
        invalidatedCells: [],
        invalidatedHexagons: [],
        isValid: false,
        errorCells: [...erasers]
      };
    }
    if (erasers.length > 0 && itemsToNegate.length > 0) {
      let itemToNegate = itemsToNegate[0];
      if (naturalErrors.length > 0) {
        const firstError = naturalErrors[0];
        const found = itemsToNegate.find((it) => it.type === "cell" && it.pos.x === firstError.x && it.pos.y === firstError.y);
        if (found) itemToNegate = found;
      } else if (adjacentMissedHexagons.length > 0) {
        const found = itemsToNegate.find((it) => it.type === "hex" && it.index === adjacentMissedHexagons[0]);
        if (found) itemToNegate = found;
      }
      const negatedCells = itemToNegate.type === "cell" ? [itemToNegate.pos] : [];
      const negatedHexagons = itemToNegate.type === "hex" ? [itemToNegate.index] : [];
      const errorCells2 = this.getRegionErrors(grid, region, negatedCells);
      for (const e of erasers) {
        errorCells2.push(e);
      }
      return {
        invalidatedCells: negatedCells,
        invalidatedHexagons: negatedHexagons,
        isValid: false,
        errorCells: errorCells2
      };
    }
    const errorCells = [...naturalErrors, ...erasers];
    return {
      invalidatedCells: [],
      invalidatedHexagons: [],
      isValid: false,
      errorCells
    };
  }
  /**
   * 配列からN個選ぶ組み合わせを取得する
   */
  getNCombinations(items, n) {
    const results = [];
    const backtrack = (start, current) => {
      if (current.length === n) {
        results.push([...current]);
        return;
      }
      for (let i = start; i < items.length; i++) {
        current.push(items[i]);
        backtrack(i + 1, current);
        current.pop();
      }
    };
    backtrack(0, []);
    return results;
  }
  /**
   * 特定の削除・無効化を適用した状態で、区画内の制約が満たされているか検証する
   */
  checkRegionValid(grid, region, erasedCells) {
    return this.getRegionErrors(grid, region, erasedCells).length === 0;
  }
  /**
   * 区画内のエラーとなっているセルを特定する
   */
  getRegionErrors(grid, region, erasedCells) {
    const erasedSet = new Set(erasedCells.map((p) => `${p.x},${p.y}`));
    const colorCounts = /* @__PURE__ */ new Map();
    const colorCells = /* @__PURE__ */ new Map();
    const starColors = /* @__PURE__ */ new Set();
    const squareColors = /* @__PURE__ */ new Set();
    const tetrisPieces = [];
    for (const cell of region) {
      if (erasedSet.has(`${cell.x},${cell.y}`)) continue;
      const constraint = grid.cells[cell.y][cell.x];
      if (constraint.type === 0 /* None */) continue;
      const color = constraint.color;
      if (color !== Color.None) {
        colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
        if (!colorCells.has(color)) colorCells.set(color, []);
        colorCells.get(color).push(cell);
      }
      if (constraint.type === 1 /* Square */) squareColors.add(color);
      else if (constraint.type === 2 /* Star */) starColors.add(color);
      else if (constraint.type === 3 /* Tetris */ || constraint.type === 4 /* TetrisRotated */) {
        if (constraint.shape) tetrisPieces.push({ shape: constraint.shape, rotatable: constraint.type === 4 /* TetrisRotated */, pos: cell });
      }
    }
    const errorCells = [];
    if (squareColors.size > 1) {
      for (const cell of region) {
        if (erasedSet.has(`${cell.x},${cell.y}`)) continue;
        if (grid.cells[cell.y][cell.x].type === 1 /* Square */) errorCells.push(cell);
      }
    }
    for (const color of starColors) {
      if (colorCounts.get(color) !== 2) {
        const cells = colorCells.get(color) || [];
        for (const p of cells) {
          const type = grid.cells[p.y][p.x].type;
          if (type === 2 /* Star */ || type === 5 /* Eraser */) {
            errorCells.push(p);
          }
        }
      }
    }
    if (tetrisPieces.length > 0) {
      if (!this.checkTetrisConstraint(
        region,
        tetrisPieces.map((p) => ({ shape: p.shape, rotatable: p.rotatable }))
      )) {
        for (const p of tetrisPieces) errorCells.push(p.pos);
      }
    }
    return errorCells;
  }
  /**
   * グローバルな制約（六角形）の割り当てをバックトラッキングで探索する
   */
  findGlobalAssignment(regionResults, totalMissedHexagons) {
    const numRegions = regionResults.length;
    const currentHexErasures = new Array(totalMissedHexagons).fill(0);
    const allInvalidatedCells = [];
    const allInvalidatedHexIndices = [];
    const backtrack = (regionIdx) => {
      if (regionIdx === numRegions) return currentHexErasures.every((count) => count === 1);
      for (const option of regionResults[regionIdx]) {
        let possible = true;
        for (const hexIdx of option.invalidatedHexagons)
          if (currentHexErasures[hexIdx] > 0) {
            possible = false;
            break;
          }
        if (possible) {
          for (const hexIdx of option.invalidatedHexagons) {
            currentHexErasures[hexIdx]++;
            allInvalidatedHexIndices.push(hexIdx);
          }
          allInvalidatedCells.push(...option.invalidatedCells);
          if (backtrack(regionIdx + 1)) return true;
          for (const hexIdx of option.invalidatedHexagons) {
            currentHexErasures[hexIdx]--;
            allInvalidatedHexIndices.pop();
          }
          for (let i = 0; i < option.invalidatedCells.length; i++) allInvalidatedCells.pop();
        }
      }
      return false;
    };
    if (backtrack(0)) return { invalidatedCells: allInvalidatedCells, invalidatedHexIndices: allInvalidatedHexIndices };
    return null;
  }
  /**
   * テトリス制約の検証（指定された領域をピースで埋め尽くせるか）
   */
  checkTetrisConstraint(region, pieces) {
    const totalTetrisArea = pieces.reduce((sum, p) => sum + this.getShapeArea(p.shape), 0);
    if (totalTetrisArea !== region.length) return false;
    const minX = Math.min(...region.map((p) => p.x));
    const minY = Math.min(...region.map((p) => p.y));
    const maxX = Math.max(...region.map((p) => p.x));
    const maxY = Math.max(...region.map((p) => p.y));
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const regionGrid = Array.from({ length: height }, () => Array(width).fill(false));
    for (const p of region) regionGrid[p.y - minY][p.x - minX] = true;
    return this.canTile(regionGrid, pieces);
  }
  getShapeArea(shape) {
    let area = 0;
    for (const row of shape) for (const cell of row) if (cell) area++;
    return area;
  }
  /**
   * 再帰的にタイリングを試みる
   */
  canTile(regionGrid, pieces) {
    let r0 = -1;
    let c0 = -1;
    for (let r = 0; r < regionGrid.length; r++) {
      for (let c = 0; c < regionGrid[0].length; c++) {
        if (regionGrid[r][c]) {
          r0 = r;
          c0 = c;
          break;
        }
      }
      if (r0 !== -1) break;
    }
    if (r0 === -1) return pieces.length === 0;
    if (pieces.length === 0) return false;
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      const nextPieces = [...pieces.slice(0, i), ...pieces.slice(i + 1)];
      const rotations = piece.rotatable ? this.getAllRotations(piece.shape) : [piece.shape];
      for (const shape of rotations) {
        const blocks = [];
        for (let pr = 0; pr < shape.length; pr++) {
          for (let pc = 0; pc < shape[0].length; pc++) {
            if (shape[pr][pc]) blocks.push({ r: pr, c: pc });
          }
        }
        for (const anchor of blocks) {
          const dr = r0 - anchor.r;
          const dc = c0 - anchor.c;
          if (this.canPlace(regionGrid, shape, dr, dc)) {
            this.placePiece(regionGrid, shape, dr, dc, false);
            if (this.canTile(regionGrid, nextPieces)) return true;
            this.placePiece(regionGrid, shape, dr, dc, true);
          }
        }
      }
    }
    return false;
  }
  canPlace(regionGrid, shape, r, c) {
    for (let i = 0; i < shape.length; i++) {
      for (let j = 0; j < shape[0].length; j++) {
        if (shape[i][j]) {
          const nr = r + i;
          const nc = c + j;
          if (nr < 0 || nr >= regionGrid.length || nc < 0 || nc >= regionGrid[0].length || !regionGrid[nr][nc]) return false;
        }
      }
    }
    return true;
  }
  placePiece(regionGrid, shape, r, c, value) {
    for (let i = 0; i < shape.length; i++) for (let j = 0; j < shape[0].length; j++) if (shape[i][j]) regionGrid[r + i][c + j] = value;
  }
  getAllRotations(shape) {
    const results = [];
    const keys = /* @__PURE__ */ new Set();
    let curr = shape;
    for (let i = 0; i < 4; i++) {
      const key = JSON.stringify(curr);
      if (!keys.has(key)) {
        results.push(curr);
        keys.add(key);
      }
      curr = this.rotate90(curr);
    }
    return results;
  }
  rotate90(shape) {
    const rows = shape.length;
    const cols = shape[0].length;
    const newShape = Array.from({ length: cols }, () => Array(rows).fill(0));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) newShape[c][rows - 1 - r] = shape[r][c];
    return newShape;
  }
  /**
   * 回答パスによって分割された各区画のセルリストを取得する
   */
  calculateRegions(grid, path) {
    const regions = [];
    const visitedCells = /* @__PURE__ */ new Set();
    const pathEdges = /* @__PURE__ */ new Set();
    for (let i = 0; i < path.length - 1; i++) pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
    const externalCells = this.getExternalCells(grid);
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (visitedCells.has(`${c},${r}`) || externalCells.has(`${c},${r}`)) continue;
        const region = [];
        const queue = [{ x: c, y: r }];
        visitedCells.add(`${c},${r}`);
        while (queue.length > 0) {
          const curr = queue.shift();
          region.push(curr);
          const neighbors = [
            { nx: curr.x, ny: curr.y - 1, p1: { x: curr.x, y: curr.y }, p2: { x: curr.x + 1, y: curr.y } },
            { nx: curr.x, ny: curr.y + 1, p1: { x: curr.x, y: curr.y + 1 }, p2: { x: curr.x + 1, y: curr.y + 1 } },
            { nx: curr.x - 1, ny: curr.y, p1: { x: curr.x, y: curr.y }, p2: { x: curr.x, y: curr.y + 1 } },
            { nx: curr.x + 1, ny: curr.y, p1: { x: curr.x + 1, y: curr.y }, p2: { x: curr.x + 1, y: curr.y + 1 } }
          ];
          for (const n of neighbors) {
            if (n.nx >= 0 && n.nx < grid.cols && n.ny >= 0 && n.ny < grid.rows) {
              const neighborKey = `${n.nx},${n.ny}`;
              if (!visitedCells.has(neighborKey) && !externalCells.has(neighborKey)) {
                const edgeKey = this.getEdgeKey(n.p1, n.p2);
                if (!pathEdges.has(edgeKey) && !this.isAbsentEdge(grid, n.p1, n.p2)) {
                  visitedCells.add(neighborKey);
                  queue.push({ x: n.nx, y: n.ny });
                }
              }
            }
          }
        }
        regions.push(region);
      }
    }
    return regions;
  }
  /**
   * エッジ（Absent）によって外部に繋がっているセルを特定する
   */
  getExternalCells(grid) {
    const external = /* @__PURE__ */ new Set();
    const queue = [];
    for (let c = 0; c < grid.cols; c++) {
      if (grid.hEdges[0][c].type === 2 /* Absent */) {
        if (!external.has(`${c},0`)) {
          external.add(`${c},0`);
          queue.push({ x: c, y: 0 });
        }
      }
      if (grid.hEdges[grid.rows][c].type === 2 /* Absent */) {
        if (!external.has(`${c},${grid.rows - 1}`)) {
          external.add(`${c},${grid.rows - 1}`);
          queue.push({ x: c, y: grid.rows - 1 });
        }
      }
    }
    for (let r = 0; r < grid.rows; r++) {
      if (grid.vEdges[r][0].type === 2 /* Absent */) {
        if (!external.has(`0,${r}`)) {
          external.add(`0,${r}`);
          queue.push({ x: 0, y: r });
        }
      }
      if (grid.vEdges[r][grid.cols].type === 2 /* Absent */) {
        if (!external.has(`${grid.cols - 1},${r}`)) {
          external.add(`${grid.cols - 1},${r}`);
          queue.push({ x: grid.cols - 1, y: r });
        }
      }
    }
    while (queue.length > 0) {
      const curr = queue.shift();
      const neighbors = [
        { nx: curr.x, ny: curr.y - 1, edge: grid.hEdges[curr.y][curr.x] },
        { nx: curr.x, ny: curr.y + 1, edge: grid.hEdges[curr.y + 1][curr.x] },
        { nx: curr.x - 1, ny: curr.y, edge: grid.vEdges[curr.y][curr.x] },
        { nx: curr.x + 1, ny: curr.y, edge: grid.vEdges[curr.y][curr.x + 1] }
      ];
      for (const n of neighbors) {
        if (n.nx >= 0 && n.nx < grid.cols && n.ny >= 0 && n.ny < grid.rows) {
          if (!external.has(`${n.nx},${n.ny}`) && n.edge.type === 2 /* Absent */) {
            external.add(`${n.nx},${n.ny}`);
            queue.push({ x: n.nx, y: n.ny });
          }
        }
      }
    }
    return external;
  }
  getEdgeKey(p1, p2) {
    return p1.x < p2.x || p1.x === p2.x && p1.y < p2.y ? `${p1.x},${p1.y}-${p2.x},${p2.y}` : `${p2.x},${p2.y}-${p1.x},${p1.y}`;
  }
  /**
   * パズルの難易度スコア(0.0-1.0)を算出する
   */
  calculateDifficulty(grid) {
    const rows = grid.rows;
    const cols = grid.cols;
    const nodeCols = cols + 1;
    const nodeCount = (rows + 1) * nodeCols;
    const adj = Array.from({ length: nodeCount }, () => []);
    const startNodes = [];
    const endNodes = [];
    const hexagonEdges = /* @__PURE__ */ new Set();
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const u = r * nodeCols + c;
        if (grid.nodes[r][c].type === 1 /* Start */) startNodes.push(u);
        if (grid.nodes[r][c].type === 2 /* End */) endNodes.push(u);
        if (c < cols) {
          const v = u + 1;
          const type = grid.hEdges[r][c].type;
          const isHexagon = type === 3 /* Hexagon */;
          const isBroken = type === 1 /* Broken */ || type === 2 /* Absent */;
          adj[u].push({ next: v, isHexagon, isBroken });
          adj[v].push({ next: u, isHexagon, isBroken });
          if (isHexagon) hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r }));
        }
        if (r < rows) {
          const v = u + nodeCols;
          const type = grid.vEdges[r][c].type;
          const isHexagon = type === 3 /* Hexagon */;
          const isBroken = type === 1 /* Broken */ || type === 2 /* Absent */;
          adj[u].push({ next: v, isHexagon, isBroken });
          adj[v].push({ next: u, isHexagon, isBroken });
          if (isHexagon) hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c, y: r + 1 }));
        }
      }
    }
    const stats = { totalNodesVisited: 0, branchingPoints: 0, solutions: 0, maxDepth: 0, backtracks: 0 };
    const totalHexagons = hexagonEdges.size;
    const fingerprints = /* @__PURE__ */ new Set();
    const searchLimit = Math.max(1e3, rows * cols * 200);
    for (const startIdx of startNodes) {
      this.exploreSearchSpace(grid, startIdx, 1n << BigInt(startIdx), [startIdx], 0, totalHexagons, adj, endNodes, fingerprints, stats, searchLimit);
    }
    if (stats.solutions === 0) return 0;
    let constraintCount = hexagonEdges.size;
    const constraintTypes = /* @__PURE__ */ new Set();
    if (hexagonEdges.size > 0) constraintTypes.add(999);
    let tetrisCount = 0;
    let rotatedTetrisCount = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid.cells[r][c];
        if (cell.type !== 0 /* None */) {
          constraintCount++;
          constraintTypes.add(cell.type);
          if (cell.type === 3 /* Tetris */) tetrisCount++;
          else if (cell.type === 4 /* TetrisRotated */) {
            tetrisCount++;
            rotatedTetrisCount++;
          }
        }
      }
    }
    const branchingFactor = stats.branchingPoints / (stats.totalNodesVisited || 1);
    const searchComplexity = Math.log10(stats.totalNodesVisited + 1);
    let difficulty = (branchingFactor * 10 + searchComplexity * 1.5) / (Math.log2(stats.solutions + 1) * 0.5 + 1);
    if (tetrisCount > 0) {
      difficulty += rotatedTetrisCount * 0.5;
      difficulty += (tetrisCount - rotatedTetrisCount) * 0.2;
    }
    const cellCount = rows * cols;
    const density = constraintCount / cellCount;
    const densityFactor = density < 0.25 ? Math.pow(density / 0.25, 4) : 1;
    const typeFactor = constraintTypes.size <= 1 ? 0.5 : 1;
    difficulty *= densityFactor * typeFactor;
    const sizeFactor = Math.log2(cellCount) / 5;
    difficulty *= sizeFactor;
    return Math.max(0.01, Math.min(1, difficulty / 4));
  }
  /**
   * 探索空間を走査して統計情報を収集する
   */
  exploreSearchSpace(grid, currIdx, visitedMask, path, hexagonsOnPath, totalHexagons, adj, endNodes, fingerprints, stats, limit) {
    stats.totalNodesVisited++;
    stats.maxDepth = Math.max(stats.maxDepth, path.length);
    if (stats.totalNodesVisited > limit) return;
    if (endNodes.includes(currIdx)) {
      if (hexagonsOnPath === totalHexagons) {
        const solutionPath = { points: path.map((idx) => ({ x: idx % (grid.cols + 1), y: Math.floor(idx / (grid.cols + 1)) })) };
        if (this.validate(grid, solutionPath).isValid) {
          const fp = this.getFingerprint(grid, solutionPath.points);
          if (!fingerprints.has(fp)) {
            fingerprints.add(fp);
            stats.solutions++;
          }
        }
      }
      return;
    }
    if (!this.canReachEndOptimized(currIdx, visitedMask, adj, endNodes)) {
      stats.backtracks++;
      return;
    }
    const validMoves = [];
    for (const edge of adj[currIdx]) {
      if (edge.isBroken) continue;
      if (visitedMask & 1n << BigInt(edge.next)) continue;
      let possible = true;
      for (const otherEdge of adj[currIdx]) {
        if (otherEdge.isHexagon) {
          const isAlreadyOnPath = path.length >= 2 && otherEdge.next === path[path.length - 2];
          const isNextMove = otherEdge.next === edge.next;
          if (!isAlreadyOnPath && !isNextMove) {
            possible = false;
            break;
          }
        }
      }
      if (possible) validMoves.push(edge);
    }
    if (validMoves.length > 1) stats.branchingPoints++;
    if (grid.rows * grid.cols > 30) {
      for (let i = validMoves.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [validMoves[i], validMoves[j]] = [validMoves[j], validMoves[i]];
      }
    }
    for (const move of validMoves) {
      path.push(move.next);
      this.exploreSearchSpace(grid, move.next, visitedMask | 1n << BigInt(move.next), path, hexagonsOnPath + (move.isHexagon ? 1 : 0), totalHexagons, adj, endNodes, fingerprints, stats, limit);
      path.pop();
      if (stats.totalNodesVisited > limit) return;
    }
  }
  /**
   * 正解数をカウントする
   */
  countSolutions(grid, limit = 100) {
    const rows = grid.rows;
    const cols = grid.cols;
    const nodeCols = cols + 1;
    const nodeCount = (rows + 1) * nodeCols;
    const adj = Array.from({ length: nodeCount }, () => []);
    const startNodes = [];
    const endNodes = [];
    const hexagonEdges = /* @__PURE__ */ new Set();
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const u = r * nodeCols + c;
        if (grid.nodes[r][c].type === 1 /* Start */) startNodes.push(u);
        if (grid.nodes[r][c].type === 2 /* End */) endNodes.push(u);
        if (c < cols) {
          const v = u + 1;
          const type = grid.hEdges[r][c].type;
          const isHexagon = type === 3 /* Hexagon */;
          const isBroken = type === 1 /* Broken */ || type === 2 /* Absent */;
          adj[u].push({ next: v, isHexagon, isBroken });
          adj[v].push({ next: u, isHexagon, isBroken });
          if (isHexagon) hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r }));
        }
        if (r < rows) {
          const v = u + nodeCols;
          const type = grid.vEdges[r][c].type;
          const isHexagon = type === 3 /* Hexagon */;
          const isBroken = type === 1 /* Broken */ || type === 2 /* Absent */;
          adj[u].push({ next: v, isHexagon, isBroken });
          adj[v].push({ next: u, isHexagon, isBroken });
          if (isHexagon) hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c, y: r + 1 }));
        }
      }
    }
    const fingerprints = /* @__PURE__ */ new Set();
    const totalHexagons = hexagonEdges.size;
    for (const startIdx of startNodes) {
      this.findPathsOptimized(grid, startIdx, 1n << BigInt(startIdx), [startIdx], 0, totalHexagons, adj, endNodes, fingerprints, limit);
    }
    return fingerprints.size;
  }
  findPathsOptimized(grid, currIdx, visitedMask, path, hexagonsOnPath, totalHexagons, adj, endNodes, fingerprints, limit) {
    if (fingerprints.size >= limit) return;
    if (endNodes.includes(currIdx)) {
      if (hexagonsOnPath === totalHexagons) {
        const solutionPath = { points: path.map((idx) => ({ x: idx % (grid.cols + 1), y: Math.floor(idx / (grid.cols + 1)) })) };
        if (this.validate(grid, solutionPath).isValid) fingerprints.add(this.getFingerprint(grid, solutionPath.points));
      }
      return;
    }
    if (!this.canReachEndOptimized(currIdx, visitedMask, adj, endNodes)) return;
    for (const edge of adj[currIdx]) {
      if (edge.isBroken) continue;
      if (visitedMask & 1n << BigInt(edge.next)) continue;
      let possible = true;
      for (const otherEdge of adj[currIdx]) {
        if (otherEdge.isHexagon) {
          const isAlreadyOnPath = path.length >= 2 && otherEdge.next === path[path.length - 2];
          const isNextMove = otherEdge.next === edge.next;
          if (!isAlreadyOnPath && !isNextMove) {
            possible = false;
            break;
          }
        }
      }
      if (!possible) continue;
      path.push(edge.next);
      this.findPathsOptimized(grid, edge.next, visitedMask | 1n << BigInt(edge.next), path, hexagonsOnPath + (edge.isHexagon ? 1 : 0), totalHexagons, adj, endNodes, fingerprints, limit);
      path.pop();
      if (fingerprints.size >= limit) return;
    }
  }
  /**
   * 終端まで到達可能かビットマスクBFSで高速に確認する
   */
  canReachEndOptimized(curr, visitedMask, adj, endNodes) {
    let queue = [curr];
    let localVisited = visitedMask;
    let head = 0;
    while (head < queue.length) {
      const u = queue[head++];
      if (endNodes.includes(u)) return true;
      for (const edge of adj[u])
        if (!edge.isBroken && !(localVisited & 1n << BigInt(edge.next))) {
          localVisited |= 1n << BigInt(edge.next);
          queue.push(edge.next);
        }
    }
    return false;
  }
  /**
   * パスの論理的な指紋を取得する（区画分けに基づき、同一解を排除するため）
   */
  getFingerprint(grid, path) {
    const regions = this.calculateRegions(grid, path);
    const regionFingerprints = regions.map((region) => {
      const marks = region.map((p) => grid.cells[p.y][p.x]).filter((c) => c.type !== 0 /* None */).map((c) => `${c.type}:${c.color}`).sort();
      return marks.join(",");
    }).sort();
    return regionFingerprints.filter((f) => f.length > 0).join("|") || "empty";
  }
};

// src/generator.ts
var PuzzleGenerator = class {
  /**
   * パズルを生成する
   * @param rows 行数
   * @param cols 列数
   * @param options 生成オプション
   * @returns 生成されたグリッド
   */
  generate(rows, cols, options = {}) {
    const targetDifficulty = options.difficulty ?? 0.5;
    const validator = new PuzzleValidator();
    let bestGrid = null;
    let bestScore = -1;
    const maxAttempts = rows * cols > 30 ? 50 : 80;
    const markAttemptsPerPath = 5;
    const startPoint = { x: 0, y: rows };
    const endPoint = { x: cols, y: 0 };
    let currentPath = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt % markAttemptsPerPath === 0) {
        currentPath = this.generateRandomPath(new Grid(rows, cols), startPoint, endPoint, options.pathLength);
      }
      const grid = this.generateFromPath(rows, cols, currentPath, options);
      if (!this.checkAllRequestedConstraintsPresent(grid, options)) continue;
      const difficulty = validator.calculateDifficulty(grid);
      if (difficulty === 0) continue;
      const diffFromTarget = Math.abs(difficulty - targetDifficulty);
      if (bestGrid === null || diffFromTarget < Math.abs(bestScore - targetDifficulty)) {
        bestScore = difficulty;
        bestGrid = grid;
      }
      if (targetDifficulty > 0.8 && difficulty > 0.8) break;
      if (diffFromTarget < 0.05) break;
    }
    if (!bestGrid) {
      const path = this.generateRandomPath(new Grid(rows, cols), startPoint, endPoint, options.pathLength);
      return this.generateFromPath(rows, cols, path, options);
    }
    return bestGrid;
  }
  /**
   * 指定されたパスに基づいてパズルを構築する
   */
  generateFromPath(rows, cols, solutionPath, options) {
    const grid = new Grid(rows, cols);
    const startPoint = { x: 0, y: rows };
    const endPoint = { x: cols, y: 0 };
    grid.nodes[startPoint.y][startPoint.x].type = 1 /* Start */;
    grid.nodes[endPoint.y][endPoint.x].type = 2 /* End */;
    this.applyConstraintsBasedOnPath(grid, solutionPath, options);
    if (options.useBrokenEdges) {
      this.applyBrokenEdges(grid, solutionPath, options);
    }
    this.cleanGrid(grid);
    return grid;
  }
  /**
   * ランダムな正解パスを生成する
   * @param targetLengthFactor 0.0 (最短) - 1.0 (最長)
   */
  generateRandomPath(grid, start, end, targetLengthFactor) {
    if (targetLengthFactor === void 0) {
      return this.generateSingleRandomPath(grid, start, end);
    }
    const minLen = grid.rows + grid.cols;
    const maxLen = (grid.rows + 1) * (grid.cols + 1) - 1;
    const targetLen = minLen + targetLengthFactor * (maxLen - minLen);
    let bestPath = [];
    let bestDiff = Infinity;
    const attempts = 50;
    for (let i = 0; i < attempts; i++) {
      const currentPath = this.generateSingleRandomPath(grid, start, end, targetLengthFactor);
      const currentLen = currentPath.length - 1;
      const diff = Math.abs(currentLen - targetLen);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestPath = currentPath;
      }
      if (bestDiff <= 1) break;
    }
    return bestPath;
  }
  /**
   * 1本のランダムパスを生成する
   */
  generateSingleRandomPath(grid, start, end, biasFactor) {
    const visited = /* @__PURE__ */ new Set();
    const path = [];
    const findPath = (current) => {
      visited.add(`${current.x},${current.y}`);
      path.push(current);
      if (current.x === end.x && current.y === end.y) return true;
      const neighbors = this.getValidNeighbors(grid, current, visited);
      if (biasFactor !== void 0) {
        neighbors.sort((a, b) => {
          const da = Math.abs(a.x - end.x) + Math.abs(a.y - end.y);
          const db = Math.abs(b.x - end.x) + Math.abs(b.y - end.y);
          const score = (da - db) * (1 - biasFactor * 2);
          return score + (Math.random() - 0.5) * 1.5;
        });
      } else {
        this.shuffleArray(neighbors);
      }
      for (const next of neighbors) {
        if (findPath(next)) return true;
      }
      path.pop();
      return false;
    };
    findPath(start);
    return path;
  }
  getValidNeighbors(grid, p, visited) {
    const candidates = [];
    const directions = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 }
    ];
    for (const d of directions) {
      const nx = p.x + d.x;
      const ny = p.y + d.y;
      if (nx >= 0 && nx <= grid.cols && ny >= 0 && ny <= grid.rows) {
        if (!visited.has(`${nx},${ny}`)) candidates.push({ x: nx, y: ny });
      }
    }
    return candidates;
  }
  /**
   * 解パスが通っていない場所にランダムに断線（Broken/Absent）を配置する
   */
  applyBrokenEdges(grid, path, options) {
    const complexity = options.complexity ?? 0.5;
    const pathEdges = /* @__PURE__ */ new Set();
    for (let i = 0; i < path.length - 1; i++) pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
    const unusedEdges = [];
    for (let r = 0; r <= grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const p1 = { x: c, y: r };
        const p2 = { x: c + 1, y: r };
        if (!pathEdges.has(this.getEdgeKey(p1, p2))) unusedEdges.push({ type: "h", r, c, p1, p2 });
      }
    }
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c <= grid.cols; c++) {
        const p1 = { x: c, y: r };
        const p2 = { x: c, y: r + 1 };
        if (!pathEdges.has(this.getEdgeKey(p1, p2))) unusedEdges.push({ type: "v", r, c, p1, p2 });
      }
    }
    this.shuffleArray(unusedEdges);
    const targetCount = Math.max(1, Math.floor(complexity * (grid.rows * grid.cols) / 4));
    let placed = 0;
    for (const edge of unusedEdges) {
      if (placed >= targetCount) break;
      let type = Math.random() < 0.8 ? 1 /* Broken */ : 2 /* Absent */;
      if (type === 2 /* Absent */ && this.isAdjacentToMark(grid, edge)) type = 1 /* Broken */;
      if (edge.type === "h") grid.hEdges[edge.r][edge.c].type = type;
      else grid.vEdges[edge.r][edge.c].type = type;
      placed++;
    }
    for (let r = 0; r <= grid.rows; r++) {
      for (let c = 0; c <= grid.cols; c++) {
        const edgesWithMeta = [];
        if (c > 0) edgesWithMeta.push({ e: grid.hEdges[r][c - 1], type: "h", r, c: c - 1 });
        if (c < grid.cols) edgesWithMeta.push({ e: grid.hEdges[r][c], type: "h", r, c });
        if (r > 0) edgesWithMeta.push({ e: grid.vEdges[r - 1][c], type: "v", r: r - 1, c });
        if (r < grid.rows) edgesWithMeta.push({ e: grid.vEdges[r][c], type: "v", r, c });
        if (edgesWithMeta.every((m) => m.e.type === 1 /* Broken */ || m.e.type === 2 /* Absent */)) {
          if (edgesWithMeta.every((m) => !this.isAdjacentToMark(grid, m))) {
            for (const m of edgesWithMeta) m.e.type = 2 /* Absent */;
          }
        }
      }
    }
  }
  /**
   * 到達不可能なエリアをAbsent化し、外部に漏れたセルをクリアする
   */
  cleanGrid(grid) {
    const startNodes = [];
    for (let r = 0; r <= grid.rows; r++) {
      for (let c = 0; c <= grid.cols; c++) if (grid.nodes[r][c].type === 1 /* Start */) startNodes.push({ x: c, y: r });
    }
    const reachableNodes = /* @__PURE__ */ new Set();
    const queue = [...startNodes];
    for (const p of startNodes) reachableNodes.add(`${p.x},${p.y}`);
    while (queue.length > 0) {
      const curr = queue.shift();
      const neighbors = [
        { nx: curr.x, ny: curr.y - 1, edge: grid.vEdges[curr.y - 1]?.[curr.x] },
        { nx: curr.x, ny: curr.y + 1, edge: grid.vEdges[curr.y]?.[curr.x] },
        { nx: curr.x - 1, ny: curr.y, edge: grid.hEdges[curr.y]?.[curr.x - 1] },
        { nx: curr.x + 1, ny: curr.y, edge: grid.hEdges[curr.y]?.[curr.x] }
      ];
      for (const n of neighbors) {
        if (n.edge && n.edge.type !== 2 /* Absent */) {
          if (!reachableNodes.has(`${n.nx},${n.ny}`)) {
            reachableNodes.add(`${n.nx},${n.ny}`);
            queue.push({ x: n.nx, y: n.ny });
          }
        }
      }
    }
    for (let r = 0; r <= grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) if (!reachableNodes.has(`${c},${r}`) || !reachableNodes.has(`${c + 1},${r}`)) grid.hEdges[r][c].type = 2 /* Absent */;
    }
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c <= grid.cols; c++) if (!reachableNodes.has(`${c},${r}`) || !reachableNodes.has(`${c},${r + 1}`)) grid.vEdges[r][c].type = 2 /* Absent */;
    }
    const external = this.getExternalCells(grid);
    for (const cellKey of external) {
      const [c, r] = cellKey.split(",").map(Number);
      grid.cells[r][c].type = 0 /* None */;
    }
  }
  getExternalCells(grid) {
    const external = /* @__PURE__ */ new Set();
    const queue = [];
    for (let c = 0; c < grid.cols; c++) {
      if (grid.hEdges[0][c].type === 2 /* Absent */) {
        if (!external.has(`${c},0`)) {
          external.add(`${c},0`);
          queue.push({ x: c, y: 0 });
        }
      }
      if (grid.hEdges[grid.rows][c].type === 2 /* Absent */) {
        if (!external.has(`${c},${grid.rows - 1}`)) {
          external.add(`${c},${grid.rows - 1}`);
          queue.push({ x: c, y: grid.rows - 1 });
        }
      }
    }
    for (let r = 0; r < grid.rows; r++) {
      if (grid.vEdges[r][0].type === 2 /* Absent */) {
        if (!external.has(`0,${r}`)) {
          external.add(`0,${r}`);
          queue.push({ x: 0, y: r });
        }
      }
      if (grid.vEdges[r][grid.cols].type === 2 /* Absent */) {
        if (!external.has(`${grid.cols - 1},${r}`)) {
          external.add(`${grid.cols - 1},${r}`);
          queue.push({ x: grid.cols - 1, y: r });
        }
      }
    }
    while (queue.length > 0) {
      const curr = queue.shift();
      const neighbors = [
        { nx: curr.x, ny: curr.y - 1, edge: grid.hEdges[curr.y][curr.x] },
        { nx: curr.x, ny: curr.y + 1, edge: grid.hEdges[curr.y + 1][curr.x] },
        { nx: curr.x - 1, ny: curr.y, edge: grid.vEdges[curr.y][curr.x] },
        { nx: curr.x + 1, ny: curr.y, edge: grid.vEdges[curr.y][curr.x + 1] }
      ];
      for (const n of neighbors) {
        if (n.nx >= 0 && n.nx < grid.cols && n.ny >= 0 && n.ny < grid.rows) {
          if (!external.has(`${n.nx},${n.ny}`) && n.edge.type === 2 /* Absent */) {
            external.add(`${n.nx},${n.ny}`);
            queue.push({ x: n.nx, y: n.ny });
          }
        }
      }
    }
    return external;
  }
  isAdjacentToMark(grid, edge) {
    if (edge.type === "h") {
      if (edge.r > 0 && grid.cells[edge.r - 1][edge.c].type !== 0 /* None */) return true;
      if (edge.r < grid.rows && grid.cells[edge.r][edge.c].type !== 0 /* None */) return true;
    } else {
      if (edge.c > 0 && grid.cells[edge.r][edge.c - 1].type !== 0 /* None */) return true;
      if (edge.c < grid.cols && grid.cells[edge.r][edge.c].type !== 0 /* None */) return true;
    }
    return false;
  }
  /**
   * マークが完全に断絶されたセルにいないか確認する
   */
  hasIsolatedMark(grid) {
    for (let r = 0; r < grid.rows; r++)
      for (let c = 0; c < grid.cols; c++) {
        if (grid.cells[r][c].type === 0 /* None */) continue;
        const edges = [grid.hEdges[r][c], grid.hEdges[r + 1][c], grid.vEdges[r][c], grid.vEdges[r][c + 1]];
        if (edges.every((e) => e.type === 1 /* Broken */ || e.type === 2 /* Absent */)) return true;
      }
    return false;
  }
  getEdgeKey(p1, p2) {
    return p1.x < p2.x || p1.x === p2.x && p1.y < p2.y ? `${p1.x},${p1.y}-${p2.x},${p2.y}` : `${p2.x},${p2.y}-${p1.x},${p1.y}`;
  }
  TETRIS_SHAPES = [
    [[1]],
    [[1, 1]],
    [[1, 1, 1]],
    [[1, 1, 1, 1]],
    [[1, 1, 1, 1, 1]],
    [
      [1, 1],
      [1, 1]
    ],
    [
      [1, 1],
      [1, 0]
    ],
    [
      [1, 1, 1],
      [1, 0, 0]
    ],
    [
      [1, 1, 1],
      [0, 0, 1]
    ],
    [
      [0, 1],
      [1, 0]
    ],
    [
      [1, 1, 1],
      [0, 1, 0]
    ],
    [
      [1, 1, 1],
      [0, 1, 0],
      [0, 1, 0]
    ],
    [
      [1, 1, 0],
      [0, 1, 1]
    ],
    [
      [0, 1, 1],
      [1, 1, 0]
    ],
    [
      [1, 1, 0],
      [0, 1, 0],
      [0, 1, 1]
    ],
    [
      [0, 1, 1],
      [0, 1, 0],
      [1, 1, 0]
    ],
    [
      [1, 1, 1],
      [1, 0, 1]
    ],
    [
      [0, 1, 0],
      [1, 0, 1]
    ],
    [
      [1, 0, 0, 1],
      [1, 0, 0, 1]
    ],
    [
      [1, 1, 1],
      [1, 0, 1],
      [1, 1, 1]
    ]
  ];
  /**
   * 解パスに基づいて各区画にルールを配置する
   */
  applyConstraintsBasedOnPath(grid, path, options) {
    const complexity = options.complexity ?? 0.5;
    const useHexagons = options.useHexagons ?? true;
    const useSquares = options.useSquares ?? true;
    const useStars = options.useStars ?? true;
    const useTetris = options.useTetris ?? false;
    const useEraser = options.useEraser ?? false;
    let hexagonsPlaced = 0;
    let squaresPlaced = 0;
    let starsPlaced = 0;
    let tetrisPlaced = 0;
    let erasersPlaced = 0;
    let totalTetrisArea = 0;
    const maxTotalTetrisArea = Math.floor(grid.rows * grid.cols * 0.45);
    if (useHexagons) {
      const targetDifficulty = options.difficulty ?? 0.5;
      for (let i = 0; i < path.length - 1; i++) {
        const neighbors = this.getValidNeighbors(grid, path[i], /* @__PURE__ */ new Set());
        const isBranching = neighbors.length > 2;
        let prob = complexity * 0.4;
        if (isBranching) prob = targetDifficulty < 0.4 ? prob * 1 : prob * 0.5;
        if (Math.random() < prob) {
          this.setEdgeHexagon(grid, path[i], path[i + 1]);
          hexagonsPlaced++;
        }
      }
      if (hexagonsPlaced === 0 && path.length >= 2) {
        const idx = Math.floor(Math.random() * (path.length - 1));
        this.setEdgeHexagon(grid, path[idx], path[idx + 1]);
      }
    }
    if (useSquares || useStars || useTetris || useEraser) {
      const regions = this.calculateRegions(grid, path);
      const availableColors = options.availableColors ?? [Color.Black, Color.White, Color.Red, Color.Blue];
      const defaultColors = options.defaultColors ?? {};
      const getDefColor = (type, fallback) => {
        if (defaultColors[type] !== void 0) return defaultColors[type];
        const name = CellType[type];
        if (name && defaultColors[name] !== void 0) return defaultColors[name];
        return fallback;
      };
      const regionIndices = Array.from({ length: regions.length }, (_, i) => i);
      this.shuffleArray(regionIndices);
      const squareColorsUsed = /* @__PURE__ */ new Set();
      const needs = {
        square: useSquares,
        star: useStars,
        tetris: useTetris,
        eraser: useEraser
      };
      for (let rIdx = 0; rIdx < regionIndices.length; rIdx++) {
        const idx = regionIndices[rIdx];
        const region = regions[idx];
        const remainingRegions = regionIndices.length - rIdx;
        const forceOne = needs.square && squaresPlaced === 0 || needs.star && starsPlaced === 0 || needs.tetris && tetrisPlaced === 0 || needs.eraser && erasersPlaced === 0;
        let placementProb = 0.2 + complexity * 0.6;
        if (forceOne && remainingRegions <= 3) placementProb = 1;
        else if (forceOne && remainingRegions <= 6) placementProb = 0.7;
        if (Math.random() > placementProb) continue;
        const potentialCells = [...region];
        this.shuffleArray(potentialCells);
        let squareColor = availableColors[Math.floor(Math.random() * availableColors.length)];
        if (useSquares && !useStars && remainingRegions <= 2 && squareColorsUsed.size === 1) {
          const otherColors = availableColors.filter((c) => !squareColorsUsed.has(c));
          if (otherColors.length > 0) squareColor = otherColors[Math.floor(Math.random() * otherColors.length)];
        }
        let shouldPlaceSquare = useSquares && Math.random() < 0.5 + complexity * 0.3;
        if (useSquares && squaresPlaced === 0 && remainingRegions <= 2) shouldPlaceSquare = true;
        if (useSquares && !useStars && remainingRegions <= 2 && squareColorsUsed.size < 2 && squaresPlaced > 0) shouldPlaceSquare = true;
        if (shouldPlaceSquare && potentialCells.length > 0) {
          const maxSquares = Math.min(potentialCells.length, Math.max(4, Math.floor(region.length / 4)));
          const numSquares = Math.floor(Math.random() * (maxSquares / 2)) + Math.ceil(maxSquares / 2);
          for (let i = 0; i < numSquares; i++) {
            if (potentialCells.length === 0) break;
            const cell = potentialCells.pop();
            grid.cells[cell.y][cell.x].type = 1 /* Square */;
            grid.cells[cell.y][cell.x].color = squareColor;
            squaresPlaced++;
            squareColorsUsed.add(squareColor);
          }
        }
        if (useTetris && totalTetrisArea < maxTotalTetrisArea) {
          let shouldPlaceTetris = Math.random() < 0.1 + complexity * 0.4;
          if (tetrisPlaced === 0 && remainingRegions <= 2) shouldPlaceTetris = true;
          const maxTetrisPerRegion = tetrisPlaced === 0 && remainingRegions <= 2 ? 6 : 4;
          if (shouldPlaceTetris && potentialCells.length > 0 && region.length <= maxTetrisPerRegion * 4 && totalTetrisArea + region.length <= maxTotalTetrisArea) {
            const tiledPieces = this.generateTiling(region, maxTetrisPerRegion, options);
            if (tiledPieces) {
              for (const p of tiledPieces) {
                if (potentialCells.length === 0) break;
                const cell = potentialCells.pop();
                grid.cells[cell.y][cell.x].type = p.isRotated ? 4 /* TetrisRotated */ : 3 /* Tetris */;
                grid.cells[cell.y][cell.x].shape = p.isRotated ? p.displayShape : p.shape;
                let tetrisColor = getDefColor(3 /* Tetris */, Color.None);
                if (useStars && Math.random() < 0.5) {
                  const colors = availableColors.filter((c) => c !== Color.Blue && c !== tetrisColor);
                  if (colors.length > 0) {
                    tetrisColor = colors[Math.floor(Math.random() * colors.length)];
                  }
                }
                grid.cells[cell.y][cell.x].color = tetrisColor;
                tetrisPlaced++;
              }
              totalTetrisArea += region.length;
            }
          }
        }
        if (useEraser && erasersPlaced < 1) {
          const prob = 0.05 + complexity * 0.2;
          let shouldPlaceEraser = Math.random() < prob;
          if (remainingRegions <= 2) shouldPlaceEraser = true;
          if (shouldPlaceEraser && potentialCells.length >= 1) {
            const errorTypes = [];
            if (useStars) errorTypes.push("star");
            if (useSquares) errorTypes.push("square");
            let boundaryEdges = [];
            if (useHexagons) {
              boundaryEdges = this.getRegionBoundaryEdges(grid, region, path);
              if (boundaryEdges.length > 0) errorTypes.push("hexagon");
            }
            if (useTetris) errorTypes.push("tetris");
            let errorType = errorTypes.length > 0 ? errorTypes[Math.floor(Math.random() * errorTypes.length)] : null;
            if (potentialCells.length >= 2 && (!errorType || Math.random() < 0.01)) errorType = "eraser";
            let errorPlaced = false;
            if (errorType === "hexagon") {
              const edge = boundaryEdges[Math.floor(Math.random() * boundaryEdges.length)];
              if (edge.type === "h") grid.hEdges[edge.r][edge.c].type = 3 /* Hexagon */;
              else grid.vEdges[edge.r][edge.c].type = 3 /* Hexagon */;
              hexagonsPlaced++;
              errorPlaced = true;
            } else if (errorType === "square" && potentialCells.length >= 2) {
              const errCell = potentialCells.pop();
              grid.cells[errCell.y][errCell.x].type = 1 /* Square */;
              const existingSquare = region.find((p) => grid.cells[p.y][p.x].type === 1 /* Square */);
              const existingSquareColor = existingSquare ? grid.cells[existingSquare.y][existingSquare.x].color : void 0;
              grid.cells[errCell.y][errCell.x].color = availableColors.find((c) => c !== existingSquareColor) || Color.Red;
              squaresPlaced++;
              errorPlaced = true;
            } else if (errorType === "star" && potentialCells.length >= 2) {
              const errCell = potentialCells.pop();
              grid.cells[errCell.y][errCell.x].type = 2 /* Star */;
              grid.cells[errCell.y][errCell.x].color = availableColors[Math.floor(Math.random() * availableColors.length)];
              starsPlaced++;
              errorPlaced = true;
            } else if (errorType === "tetris" && potentialCells.length >= 2) {
              const tiledPieces = this.generateTiling(region, 4, options);
              let piecesToPlace = [];
              if (tiledPieces && tiledPieces.length > 0) {
                let currentArea = 0;
                for (const p of tiledPieces) {
                  const area = this.getShapeArea(p.shape);
                  if (currentArea + area < region.length) {
                    piecesToPlace.push(p);
                    currentArea += area;
                  } else break;
                }
              }
              if (piecesToPlace.length === 0 && region.length > 1) {
                piecesToPlace = [{ shape: [[1]], displayShape: [[1]], isRotated: false }];
              }
              if (piecesToPlace.length > 0) {
                for (const p of piecesToPlace) {
                  if (potentialCells.length < 2) break;
                  const cell = potentialCells.pop();
                  grid.cells[cell.y][cell.x].type = p.isRotated ? 4 /* TetrisRotated */ : 3 /* Tetris */;
                  grid.cells[cell.y][cell.x].shape = p.isRotated ? p.displayShape : p.shape;
                  let tetrisColor = Color.None;
                  if (useStars && Math.random() < 0.3) {
                    const colors = availableColors.filter((c) => c !== Color.Blue);
                    tetrisColor = colors[Math.floor(Math.random() * colors.length)];
                  }
                  grid.cells[cell.y][cell.x].color = tetrisColor;
                  tetrisPlaced++;
                }
                errorPlaced = true;
              }
            } else if (errorType === "eraser" && potentialCells.length >= 2) {
              const errCell = potentialCells.pop();
              grid.cells[errCell.y][errCell.x].type = 5 /* Eraser */;
              grid.cells[errCell.y][errCell.x].color = getDefColor(5 /* Eraser */, Color.White);
              erasersPlaced++;
              errorPlaced = true;
            }
            if (!errorPlaced && potentialCells.length >= 2) {
              const errCell = potentialCells.pop();
              grid.cells[errCell.y][errCell.x].type = 5 /* Eraser */;
              grid.cells[errCell.y][errCell.x].color = getDefColor(5 /* Eraser */, Color.White);
              erasersPlaced++;
              errorPlaced = true;
            }
            if (errorPlaced) {
              const cell = potentialCells.pop();
              grid.cells[cell.y][cell.x].type = 5 /* Eraser */;
              let eraserColor = getDefColor(5 /* Eraser */, Color.White);
              if (useStars && Math.random() < 0.4) {
                const colors = availableColors.filter((c) => c !== eraserColor);
                if (colors.length > 0) {
                  eraserColor = colors[Math.floor(Math.random() * colors.length)];
                }
              }
              grid.cells[cell.y][cell.x].color = eraserColor;
              erasersPlaced++;
            }
          }
        }
        if (useStars) {
          const maxPairs = Math.max(1, Math.floor(region.length / 8));
          for (let p = 0; p < maxPairs; p++) {
            for (const color of availableColors) {
              if (potentialCells.length < 1) break;
              if (Math.random() > 0.3 + complexity * 0.4) continue;
              const colorCount = region.filter((p2) => grid.cells[p2.y][p2.x].color === color).length;
              if (colorCount === 1) {
                const cell = potentialCells.pop();
                grid.cells[cell.y][cell.x].type = 2 /* Star */;
                grid.cells[cell.y][cell.x].color = color;
                starsPlaced++;
              } else if (colorCount === 0 && potentialCells.length >= 2) {
                for (let i = 0; i < 2; i++) {
                  const cell = potentialCells.pop();
                  grid.cells[cell.y][cell.x].type = 2 /* Star */;
                  grid.cells[cell.y][cell.x].color = color;
                  starsPlaced++;
                }
              }
            }
          }
        }
      }
      if (useSquares && !useStars && squareColorsUsed.size < 2) {
        for (const region of regions) {
          if (region.every((p) => grid.cells[p.y][p.x].type === 0 /* None */)) {
            const otherColor = availableColors.find((c) => !squareColorsUsed.has(c)) || Color.White;
            const cell = region[Math.floor(Math.random() * region.length)];
            grid.cells[cell.y][cell.x].type = 1 /* Square */;
            grid.cells[cell.y][cell.x].color = otherColor;
            squareColorsUsed.add(otherColor);
            squaresPlaced++;
            break;
          }
        }
      }
    }
  }
  /**
   * 区画分けを行う
   */
  calculateRegions(grid, path) {
    const regions = [];
    const visitedCells = /* @__PURE__ */ new Set();
    const pathEdges = /* @__PURE__ */ new Set();
    for (let i = 0; i < path.length - 1; i++) pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (visitedCells.has(`${c},${r}`)) continue;
        const currentRegion = [];
        const queue = [{ x: c, y: r }];
        visitedCells.add(`${c},${r}`);
        while (queue.length > 0) {
          const cell = queue.shift();
          currentRegion.push(cell);
          const neighbors = [
            { dx: 0, dy: -1, p1: { x: cell.x, y: cell.y }, p2: { x: cell.x + 1, y: cell.y } },
            { dx: 0, dy: 1, p1: { x: cell.x, y: cell.y + 1 }, p2: { x: cell.x + 1, y: cell.y + 1 } },
            { dx: -1, dy: 0, p1: { x: cell.x, y: cell.y }, p2: { x: cell.x, y: cell.y + 1 } },
            { dx: 1, dy: 0, p1: { x: cell.x + 1, y: cell.y }, p2: { x: cell.x + 1, y: cell.y + 1 } }
          ];
          for (const n of neighbors) {
            const nx = cell.x + n.dx;
            const ny = cell.y + n.dy;
            if (nx >= 0 && nx < grid.cols && ny >= 0 && ny < grid.rows) {
              if (!visitedCells.has(`${nx},${ny}`) && !pathEdges.has(this.getEdgeKey(n.p1, n.p2)) && !this.isAbsentEdge(grid, n.p1, n.p2)) {
                visitedCells.add(`${nx},${ny}`);
                queue.push({ x: nx, y: ny });
              }
            }
          }
        }
        regions.push(currentRegion);
      }
    }
    return regions;
  }
  isAbsentEdge(grid, p1, p2) {
    if (p1.x === p2.x) {
      const y = Math.min(p1.y, p2.y);
      return grid.vEdges[y][p1.x].type === 2 /* Absent */;
    } else {
      const x = Math.min(p1.x, p2.x);
      return grid.hEdges[p1.y][x].type === 2 /* Absent */;
    }
  }
  /**
   * 区画の境界エッジのうち、解パスが通っていないものを取得する
   */
  getRegionBoundaryEdges(grid, region, path) {
    const pathEdges = /* @__PURE__ */ new Set();
    for (let i = 0; i < path.length - 1; i++) pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
    const boundary = [];
    for (const cell of region) {
      const edges = [
        { type: "h", r: cell.y, c: cell.x },
        { type: "h", r: cell.y + 1, c: cell.x },
        { type: "v", r: cell.y, c: cell.x },
        { type: "v", r: cell.y, c: cell.x + 1 }
      ];
      for (const e of edges) {
        const p1 = e.type === "h" ? { x: e.c, y: e.r } : { x: e.c, y: e.r };
        const p2 = e.type === "h" ? { x: e.c + 1, y: e.r } : { x: e.c, y: e.r + 1 };
        const key = this.getEdgeKey(p1, p2);
        if (!pathEdges.has(key) && !this.isAbsentEdge(grid, p1, p2)) {
          boundary.push(e);
        }
      }
    }
    const unique = /* @__PURE__ */ new Map();
    for (const e of boundary) unique.set(`${e.type},${e.r},${e.c}`, e);
    return Array.from(unique.values());
  }
  setEdgeHexagon(grid, p1, p2) {
    if (p1.x === p2.x) grid.vEdges[Math.min(p1.y, p2.y)][p1.x].type = 3 /* Hexagon */;
    else grid.hEdges[p1.y][Math.min(p1.x, p2.x)].type = 3 /* Hexagon */;
  }
  /**
   * 要求された制約が全て含まれているか確認する
   */
  checkAllRequestedConstraintsPresent(grid, options) {
    const useHexagons = options.useHexagons ?? true;
    const useSquares = options.useSquares ?? true;
    const useStars = options.useStars ?? true;
    const useTetris = options.useTetris ?? false;
    const useEraser = options.useEraser ?? false;
    const useBrokenEdges = options.useBrokenEdges ?? false;
    if (useBrokenEdges) {
      let found = false;
      for (let r = 0; r <= grid.rows; r++)
        for (let c = 0; c < grid.cols; c++)
          if (grid.hEdges[r][c].type === 1 /* Broken */ || grid.hEdges[r][c].type === 2 /* Absent */) {
            found = true;
            break;
          }
      if (!found) {
        for (let r = 0; r < grid.rows; r++)
          for (let c = 0; c <= grid.cols; c++)
            if (grid.vEdges[r][c].type === 1 /* Broken */ || grid.vEdges[r][c].type === 2 /* Absent */) {
              found = true;
              break;
            }
      }
      if (!found) return false;
    }
    if (useHexagons) {
      let found = false;
      for (let r = 0; r <= grid.rows; r++)
        for (let c = 0; c < grid.cols; c++)
          if (grid.hEdges[r][c].type === 3 /* Hexagon */) {
            found = true;
            break;
          }
      if (!found) {
        for (let r = 0; r < grid.rows; r++)
          for (let c = 0; c <= grid.cols; c++)
            if (grid.vEdges[r][c].type === 3 /* Hexagon */) {
              found = true;
              break;
            }
      }
      if (!found) return false;
    }
    if (useSquares || useStars || useTetris || useEraser) {
      let fSq = false;
      let fSt = false;
      let fT = false;
      let fE = false;
      const sqC = /* @__PURE__ */ new Set();
      for (let r = 0; r < grid.rows; r++)
        for (let c = 0; c < grid.cols; c++) {
          const type = grid.cells[r][c].type;
          if (type === 1 /* Square */) {
            fSq = true;
            sqC.add(grid.cells[r][c].color);
          }
          if (type === 2 /* Star */) fSt = true;
          if (type === 3 /* Tetris */ || type === 4 /* TetrisRotated */) fT = true;
          if (type === 5 /* Eraser */) fE = true;
        }
      if (useSquares && !fSq) return false;
      if (useStars && !fSt) return false;
      if (useTetris && !fT) return false;
      if (useEraser && !fE) return false;
      if (useSquares && fSq && !fSt && sqC.size < 2) return false;
    }
    if (this.hasIsolatedMark(grid)) return false;
    return true;
  }
  /**
   * 指定された区画をピースで埋め尽くすタイリングを生成する
   */
  generateTiling(region, maxPieces, options) {
    const minX = Math.min(...region.map((p) => p.x));
    const minY = Math.min(...region.map((p) => p.y));
    const maxX = Math.max(...region.map((p) => p.x));
    const maxY = Math.max(...region.map((p) => p.y));
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const regionGrid = Array.from({ length: height }, () => Array(width).fill(false));
    for (const p of region) regionGrid[p.y - minY][p.x - minX] = true;
    return this.tilingDfs(regionGrid, [], maxPieces, options);
  }
  /**
   * タイリングを深さ優先探索で生成する
   */
  tilingDfs(regionGrid, currentPieces, maxPieces, options) {
    let r0 = -1;
    let c0 = -1;
    for (let r = 0; r < regionGrid.length; r++) {
      for (let c = 0; c < regionGrid[0].length; c++)
        if (regionGrid[r][c]) {
          r0 = r;
          c0 = c;
          break;
        }
      if (r0 !== -1) break;
    }
    if (r0 === -1) return currentPieces;
    if (currentPieces.length >= maxPieces) return null;
    const difficulty = options.difficulty ?? 0.5;
    let shapes = [...this.TETRIS_SHAPES];
    this.shuffleArray(shapes);
    if (difficulty > 0.6) shapes.sort((a, b) => this.getShapeArea(b) - this.getShapeArea(a));
    for (const baseShape of shapes) {
      const isInv = this.isRotationallyInvariant(baseShape);
      const rotations = isInv ? [baseShape] : this.getAllRotations(baseShape);
      this.shuffleArray(rotations);
      for (const shape of rotations) {
        const blocks = [];
        for (let pr = 0; pr < shape.length; pr++) for (let pc = 0; pc < shape[0].length; pc++) if (shape[pr][pc]) blocks.push({ r: pr, c: pc });
        for (const anchor of blocks) {
          const dr = r0 - anchor.r;
          const dc = c0 - anchor.c;
          if (this.canPlace(regionGrid, shape, dr, dc)) {
            this.placePiece(regionGrid, shape, dr, dc, false);
            const result = this.tilingDfs(regionGrid, [...currentPieces, { shape, displayShape: baseShape, isRotated: !isInv && Math.random() < 0.3 + difficulty * 0.6 }], maxPieces, options);
            if (result) return result;
            this.placePiece(regionGrid, shape, dr, dc, true);
          }
        }
      }
    }
    return null;
  }
  getShapeArea(shape) {
    let area = 0;
    for (const row of shape) for (const cell of row) if (cell) area++;
    return area;
  }
  isRotationallyInvariant(shape) {
    const area = this.getShapeArea(shape);
    return area === 1 || area === 4 && shape.length === 2 && shape[0].length === 2;
  }
  getAllRotations(shape) {
    const results = [];
    const keys = /* @__PURE__ */ new Set();
    let curr = shape;
    for (let i = 0; i < 4; i++) {
      const key = JSON.stringify(curr);
      if (!keys.has(key)) {
        results.push(curr);
        keys.add(key);
      }
      curr = this.rotate90(curr);
    }
    return results;
  }
  rotate90(shape) {
    const rows = shape.length;
    const cols = shape[0].length;
    const newShape = Array.from({ length: cols }, () => Array(rows).fill(0));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) newShape[c][rows - 1 - r] = shape[r][c];
    return newShape;
  }
  canPlace(regionGrid, shape, r, c) {
    for (let i = 0; i < shape.length; i++)
      for (let j = 0; j < shape[0].length; j++)
        if (shape[i][j]) {
          const nr = r + i, nc = c + j;
          if (nr < 0 || nr >= regionGrid.length || nc < 0 || nc >= regionGrid[0].length || !regionGrid[nr][nc]) return false;
        }
    return true;
  }
  placePiece(regionGrid, shape, r, c, value) {
    for (let i = 0; i < shape.length; i++) for (let j = 0; j < shape[0].length; j++) if (shape[i][j]) regionGrid[r + i][c + j] = value;
  }
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
};

// src/serializer.ts
var BitWriter = class {
  bytes = [];
  cur = 0;
  bit = 0;
  write(value, bits) {
    for (let i = 0; i < bits; i++) {
      if (value & 1 << i) this.cur |= 1 << this.bit;
      this.bit++;
      if (this.bit === 8) {
        this.bytes.push(this.cur);
        this.cur = 0;
        this.bit = 0;
      }
    }
  }
  finish() {
    if (this.bit > 0) this.bytes.push(this.cur);
    return new Uint8Array(this.bytes);
  }
};
var BitReader = class {
  constructor(buf) {
    this.buf = buf;
  }
  i = 0;
  bit = 0;
  read(bits) {
    let v = 0;
    for (let i = 0; i < bits; i++) {
      if (this.buf[this.i] & 1 << this.bit) v |= 1 << i;
      this.bit++;
      if (this.bit === 8) {
        this.bit = 0;
        this.i++;
      }
    }
    return v;
  }
};
function collectShapes(cells) {
  const map = /* @__PURE__ */ new Map();
  for (const row of cells) {
    for (const c of row) {
      if (c.shape) {
        const key = JSON.stringify(c.shape);
        if (!map.has(key)) map.set(key, c.shape);
      }
    }
  }
  return [...map.values()];
}
var PuzzleSerializer = class {
  static async serialize(puzzle, options) {
    const bw = new BitWriter();
    bw.write(puzzle.rows, 6);
    bw.write(puzzle.cols, 6);
    const shapes = collectShapes(puzzle.cells);
    bw.write(shapes.length, 5);
    for (const s of shapes) {
      bw.write(s.length, 4);
      bw.write(s[0].length, 4);
      for (const r of s) for (const v of r) bw.write(v, 1);
    }
    const shapeIndex = /* @__PURE__ */ new Map();
    shapes.forEach((s, i) => shapeIndex.set(JSON.stringify(s), i));
    for (const row of puzzle.cells) {
      for (const c of row) {
        bw.write(c.type, 3);
        bw.write(c.color, 3);
        if (c.shape) {
          bw.write(1, 1);
          bw.write(shapeIndex.get(JSON.stringify(c.shape)), 5);
        } else {
          bw.write(0, 1);
        }
      }
    }
    for (let y = 0; y < puzzle.rows; y++) for (let x = 0; x < puzzle.cols + 1; x++) bw.write(puzzle.vEdges[y][x].type, 2);
    for (let y = 0; y < puzzle.rows + 1; y++) for (let x = 0; x < puzzle.cols; x++) bw.write(puzzle.hEdges[y][x].type, 2);
    for (let y = 0; y < puzzle.rows + 1; y++) for (let x = 0; x < puzzle.cols + 1; x++) bw.write(puzzle.nodes[y][x].type, 2);
    bw.write(+!!options.useHexagons, 1);
    bw.write(+!!options.useSquares, 1);
    bw.write(+!!options.useStars, 1);
    bw.write(+!!options.useTetris, 1);
    bw.write(+!!options.useEraser, 1);
    bw.write(+!!options.useBrokenEdges, 1);
    bw.write(Math.round((options.complexity ?? 0) * 254), 8);
    bw.write(Math.round((options.difficulty ?? 0) * 254), 8);
    bw.write(Math.round((options.pathLength ?? 0) * 254), 8);
    const raw = bw.finish();
    const gz = new Uint8Array(await new Response(new Blob([raw.buffer]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
    let parity = 0;
    for (const b of gz) parity ^= b;
    const final = new Uint8Array(gz.length + 1);
    final.set(gz);
    final[gz.length] = parity;
    return btoa(String.fromCharCode(...final)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  static async deserialize(str) {
    let s = str.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    const buf = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    let parity = 0;
    for (let i = 0; i < buf.length - 1; i++) parity ^= buf[i];
    if (parity !== buf.at(-1)) throw new Error("Invalid parity data");
    const raw = new Uint8Array(await new Response(new Blob([buf.slice(0, -1).buffer]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
    const br = new BitReader(raw);
    const rows = br.read(6);
    const cols = br.read(6);
    const shapeCount = br.read(5);
    const shapes = [];
    for (let i = 0; i < shapeCount; i++) {
      const h = br.read(4);
      const w = br.read(4);
      const s2 = [];
      for (let y = 0; y < h; y++) {
        const r = [];
        for (let x = 0; x < w; x++) r.push(br.read(1));
        s2.push(r);
      }
      shapes.push(s2);
    }
    const cells = [];
    for (let y = 0; y < rows; y++) {
      const row = [];
      for (let x = 0; x < cols; x++) {
        const type = br.read(3);
        const color = br.read(3);
        const hasShape = br.read(1);
        const cell = { type, color };
        if (hasShape) cell.shape = shapes[br.read(5)].map((r) => r.slice());
        row.push(cell);
      }
      cells.push(row);
    }
    const vEdges = Array.from({ length: rows }, () => Array.from({ length: cols + 1 }, () => ({ type: br.read(2) })));
    const hEdges = Array.from({ length: rows + 1 }, () => Array.from({ length: cols }, () => ({ type: br.read(2) })));
    const nodes = Array.from({ length: rows + 1 }, () => Array.from({ length: cols + 1 }, () => ({ type: br.read(2) })));
    const readRatio = () => {
      const v = br.read(8);
      return Math.round(v / 254 * 1e3) / 1e3;
    };
    const options = {};
    const useHexagons = !!br.read(1);
    const useSquares = !!br.read(1);
    const useStars = !!br.read(1);
    const useTetris = !!br.read(1);
    const useEraser = !!br.read(1);
    const useBroken = !!br.read(1);
    if (useHexagons) options.useHexagons = true;
    if (useSquares) options.useSquares = true;
    if (useStars) options.useStars = true;
    if (useTetris) options.useTetris = true;
    if (useEraser) options.useEraser = true;
    if (useBroken) options.useBrokenEdges = true;
    const complexity = readRatio();
    const difficulty = readRatio();
    const pathLength = readRatio();
    if (complexity !== 0) options.complexity = complexity;
    if (difficulty !== 0) options.difficulty = difficulty;
    if (pathLength !== 0) options.pathLength = pathLength;
    return { puzzle: { rows, cols, cells, vEdges, hEdges, nodes }, options };
  }
};

// src/ui.ts
var WitnessUI = class {
  canvas;
  ctx;
  puzzle = null;
  options;
  path = [];
  isDrawing = false;
  currentMousePos = { x: 0, y: 0 };
  exitTipPos = null;
  isInvalidPath = false;
  // アニメーション・状態表示用
  invalidatedCells = [];
  invalidatedEdges = [];
  errorCells = [];
  errorEdges = [];
  eraserAnimationStartTime = 0;
  isFading = false;
  fadeOpacity = 1;
  fadeColor = "#ff4444";
  fadingPath = [];
  fadingTipPos = null;
  isSuccessFading = false;
  successFadeStartTime = 0;
  startTime = Date.now();
  // 透過描画用のオフスクリーンCanvas
  offscreenCanvas = null;
  offscreenCtx = null;
  constructor(canvasOrId, puzzle, options = {}) {
    if (typeof window === "undefined") {
      this.canvas = {};
      this.ctx = {};
      this.options = this.mergeOptions(options);
      return;
    }
    if (typeof canvasOrId === "string") {
      const el = document.getElementById(canvasOrId);
      if (!(el instanceof HTMLCanvasElement)) {
        throw new Error(`Element with id "${canvasOrId}" is not a canvas.`);
      }
      this.canvas = el;
    } else {
      this.canvas = canvasOrId;
    }
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Could not get 2D context.");
    this.ctx = context;
    this.ctx.imageSmoothingEnabled = false;
    this.options = this.mergeOptions(options);
    if (puzzle) {
      this.setPuzzle(puzzle);
    }
    this.initEvents();
    this.animate();
  }
  mergeOptions(options) {
    return {
      gridPadding: options.gridPadding ?? 60,
      cellSize: options.cellSize ?? 80,
      nodeRadius: options.nodeRadius ?? 6,
      startNodeRadius: options.startNodeRadius ?? 22,
      pathWidth: options.pathWidth ?? 18,
      exitLength: options.exitLength ?? 25,
      autoResize: options.autoResize ?? true,
      animations: {
        blinkDuration: options.animations?.blinkDuration ?? 1e3,
        fadeDuration: options.animations?.fadeDuration ?? 1e3,
        blinkPeriod: options.animations?.blinkPeriod ?? 800
      },
      colors: {
        path: options.colors?.path ?? "#ffcc00",
        error: options.colors?.error ?? "#ff4444",
        success: options.colors?.success ?? "#ffcc00",
        interrupted: options.colors?.interrupted ?? "#ffcc00",
        grid: options.colors?.grid ?? "#555",
        node: options.colors?.node ?? "#555",
        hexagon: options.colors?.hexagon ?? "#ffcc00",
        colorMap: options.colors?.colorMap ?? {
          [Color.Black]: "#000",
          [Color.White]: "#fff",
          [Color.Red]: "#f00",
          [Color.Blue]: "#00f",
          [Color.None]: "#ffcc00"
        },
        colorList: options.colors?.colorList
      },
      onPathComplete: options.onPathComplete ?? (() => {
      })
    };
  }
  /**
   * パズルデータを設定し、再描画する
   */
  setPuzzle(puzzle) {
    this.puzzle = puzzle;
    this.path = [];
    this.isDrawing = false;
    this.exitTipPos = null;
    this.invalidatedCells = [];
    this.invalidatedEdges = [];
    this.errorCells = [];
    this.errorEdges = [];
    this.cancelFade();
    if (this.options.autoResize) {
      this.resizeCanvas();
    }
    this.draw();
  }
  /**
   * 表示オプションを更新する
   */
  setOptions(options) {
    this.options = this.mergeOptions({ ...this.options, ...options });
    if (this.options.autoResize && this.puzzle) {
      this.resizeCanvas();
    }
    this.draw();
  }
  /**
   * 検証結果を反映させる（不正解時の赤点滅や、消しゴムによる無効化の表示）
   */
  setValidationResult(isValid, invalidatedCells = [], invalidatedEdges = [], errorCells = [], errorEdges = []) {
    this.invalidatedCells = invalidatedCells;
    this.invalidatedEdges = invalidatedEdges;
    this.errorCells = errorCells;
    this.errorEdges = errorEdges;
    this.eraserAnimationStartTime = Date.now();
    if (isValid) {
      this.isSuccessFading = true;
      this.successFadeStartTime = Date.now();
    } else {
      this.isInvalidPath = true;
    }
  }
  resizeCanvas() {
    if (!this.puzzle || !this.canvas) return;
    this.canvas.width = this.puzzle.cols * this.options.cellSize + this.options.gridPadding * 2;
    this.canvas.height = this.puzzle.rows * this.options.cellSize + this.options.gridPadding * 2;
  }
  initEvents() {
    if (typeof window === "undefined") return;
    this.canvas.addEventListener("mousedown", (e) => this.handleStart(e));
    window.addEventListener("mousemove", (e) => this.handleMove(e));
    window.addEventListener("mouseup", (e) => this.handleEnd(e));
    this.canvas.addEventListener(
      "touchstart",
      (e) => {
        if (this.handleStart(e.touches[0])) {
          e.preventDefault();
        }
      },
      { passive: false }
    );
    window.addEventListener(
      "touchmove",
      (e) => {
        if (this.isDrawing) {
          e.preventDefault();
        }
        this.handleMove(e.touches[0]);
      },
      { passive: false }
    );
    window.addEventListener(
      "touchend",
      (e) => {
        if (this.isDrawing) {
          e.preventDefault();
        }
        this.handleEnd(e.changedTouches[0]);
      },
      { passive: false }
    );
  }
  // --- 座標変換 ---
  getCanvasCoords(gridX, gridY) {
    return {
      x: this.options.gridPadding + gridX * this.options.cellSize,
      y: this.options.gridPadding + gridY * this.options.cellSize
    };
  }
  getExitDir(x, y) {
    if (!this.puzzle) return null;
    if (this.puzzle.nodes[y][x].type !== 2 /* End */) return null;
    if (x === this.puzzle.cols) return { x: 1, y: 0 };
    if (x === 0) return { x: -1, y: 0 };
    if (y === 0) return { x: 0, y: -1 };
    if (y === this.puzzle.rows) return { x: 0, y: 1 };
    return { x: 1, y: 0 };
  }
  // --- イベントハンドラ ---
  handleStart(e) {
    if (!this.puzzle) return false;
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    for (let r = 0; r <= this.puzzle.rows; r++) {
      for (let c = 0; c <= this.puzzle.cols; c++) {
        if (this.puzzle.nodes[r][c].type === 1 /* Start */) {
          const nodePos = this.getCanvasCoords(c, r);
          const dist = Math.hypot(nodePos.x - mouseX, nodePos.y - mouseY);
          if (dist < this.options.startNodeRadius) {
            this.cancelFade();
            this.isSuccessFading = false;
            this.isInvalidPath = false;
            this.invalidatedCells = [];
            this.invalidatedEdges = [];
            this.errorCells = [];
            this.errorEdges = [];
            this.isDrawing = true;
            this.path = [{ x: c, y: r }];
            this.currentMousePos = nodePos;
            this.exitTipPos = null;
            this.draw();
            return true;
          }
        }
      }
    }
    return false;
  }
  handleMove(e) {
    if (!this.puzzle || !this.isDrawing) return;
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    const lastPoint = this.path[this.path.length - 1];
    const lastPos = this.getCanvasCoords(lastPoint.x, lastPoint.y);
    const dx = mouseX - lastPos.x;
    const dy = mouseY - lastPos.y;
    const exitDir = this.getExitDir(lastPoint.x, lastPoint.y);
    if (exitDir) {
      const dot = dx * exitDir.x + dy * exitDir.y;
      if (dot > 0) {
        const length = Math.min(dot, this.options.exitLength);
        this.currentMousePos = {
          x: lastPos.x + exitDir.x * length,
          y: lastPos.y + exitDir.y * length
        };
        this.draw();
        return;
      }
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      const dir = dx > 0 ? 1 : -1;
      const target = { x: lastPoint.x + dir, y: lastPoint.y };
      const edgeType = this.getEdgeType(lastPoint, target);
      if (target.x >= 0 && target.x <= this.puzzle.cols && edgeType !== 2 /* Absent */) {
        const maxMove = edgeType === 1 /* Broken */ ? this.options.cellSize * 0.35 : this.options.cellSize;
        this.currentMousePos = {
          x: lastPos.x + Math.max(-maxMove, Math.min(maxMove, dx)),
          y: lastPos.y
        };
      } else {
        this.currentMousePos = lastPos;
      }
    } else {
      const dir = dy > 0 ? 1 : -1;
      const target = { x: lastPoint.x, y: lastPoint.y + dir };
      const edgeType = this.getEdgeType(lastPoint, target);
      if (target.y >= 0 && target.y <= this.puzzle.rows && edgeType !== 2 /* Absent */) {
        const maxMove = edgeType === 1 /* Broken */ ? this.options.cellSize * 0.35 : this.options.cellSize;
        this.currentMousePos = {
          x: lastPos.x,
          y: lastPos.y + Math.max(-maxMove, Math.min(maxMove, dy))
        };
      } else {
        this.currentMousePos = lastPos;
      }
    }
    const neighbors = [
      { x: lastPoint.x + 1, y: lastPoint.y },
      { x: lastPoint.x - 1, y: lastPoint.y },
      { x: lastPoint.x, y: lastPoint.y + 1 },
      { x: lastPoint.x, y: lastPoint.y - 1 }
    ];
    for (const n of neighbors) {
      if (n.x >= 0 && n.x <= this.puzzle.cols && n.y >= 0 && n.y <= this.puzzle.rows) {
        const nPos = this.getCanvasCoords(n.x, n.y);
        const dist = Math.hypot(nPos.x - this.currentMousePos.x, nPos.y - this.currentMousePos.y);
        if (dist < this.options.cellSize * 0.3) {
          const idx = this.path.findIndex((p) => p.x === n.x && p.y === n.y);
          if (idx === -1) {
            this.path.push(n);
          } else if (idx === this.path.length - 2) {
            this.path.pop();
          }
        }
      }
    }
    this.draw();
  }
  handleEnd(e) {
    if (!this.puzzle || !this.isDrawing) return;
    this.isDrawing = false;
    const lastPoint = this.path[this.path.length - 1];
    const lastPos = this.getCanvasCoords(lastPoint.x, lastPoint.y);
    const exitDir = this.getExitDir(lastPoint.x, lastPoint.y);
    if (exitDir) {
      const distToExit = Math.hypot(this.currentMousePos.x - lastPos.x, this.currentMousePos.y - lastPos.y);
      if (distToExit > this.options.exitLength * 0.1) {
        this.exitTipPos = { ...this.currentMousePos };
        this.options.onPathComplete(this.path);
        return;
      }
    }
    this.exitTipPos = exitDir ? { ...this.currentMousePos } : null;
    this.startFade(this.options.colors.interrupted);
  }
  getEdgeType(p1, p2) {
    if (!this.puzzle) return 2 /* Absent */;
    if (p1.x === p2.x) {
      const y = Math.min(p1.y, p2.y);
      if (y < 0 || y >= this.puzzle.rows) return 2 /* Absent */;
      return this.puzzle.vEdges[y][p1.x].type;
    } else {
      const x = Math.min(p1.x, p2.x);
      if (x < 0 || x >= this.puzzle.cols) return 2 /* Absent */;
      return this.puzzle.hEdges[p1.y][x].type;
    }
  }
  startFade(color = "#ff4444") {
    this.isFading = true;
    this.fadeOpacity = 1;
    this.fadeColor = color;
    this.fadingPath = [...this.path];
    this.fadingTipPos = this.exitTipPos ? { ...this.exitTipPos } : null;
    this.path = [];
  }
  cancelFade() {
    this.isFading = false;
  }
  animate() {
    if (typeof window === "undefined") return;
    this.draw();
    if (this.isFading) {
      const step = 1e3 / (this.options.animations.fadeDuration * 60);
      this.fadeOpacity -= step;
      if (this.fadeOpacity <= 0) {
        this.isFading = false;
        this.fadeOpacity = 0;
      }
    }
    requestAnimationFrame(() => this.animate());
  }
  // --- Drawing Logic ---
  draw() {
    if (!this.puzzle || !this.ctx) return;
    const ctx = this.ctx;
    const now = Date.now();
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawGrid(ctx);
    this.drawConstraints(ctx);
    this.drawNodes(ctx);
    if (this.path.length === 0 && !this.isDrawing) {
      this.drawRipples(ctx);
    }
    if (this.isFading) {
      this.drawPath(ctx, this.fadingPath, false, this.fadeColor, this.fadeOpacity, this.fadingTipPos);
    } else if (this.path.length > 0) {
      let color = this.isInvalidPath ? this.options.colors.error : this.options.colors.path;
      if (this.isSuccessFading) {
        color = this.options.colors.success;
      }
      if (!this.isDrawing && this.exitTipPos && !this.isInvalidPath) {
        const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
        const blinkDuration = this.options.animations.blinkDuration;
        if (elapsed < blinkDuration) {
          if (this.isSuccessFading) {
            const hasNegation = this.invalidatedCells.length > 0 || this.invalidatedEdges.length > 0;
            if (hasNegation) {
              color = this.options.colors.error;
            }
          } else {
            const transitionIn = Math.min(1, elapsed / 200);
            const transitionOut = elapsed > blinkDuration * 0.8 ? (blinkDuration - elapsed) / (blinkDuration * 0.2) : 1;
            const transitionFactor = Math.min(transitionIn, transitionOut);
            const blinkFactor = (Math.sin(now * Math.PI * 2 / this.options.animations.blinkPeriod) + 1) / 2;
            color = this.lerpColor(this.options.colors.path, this.options.colors.error, blinkFactor * transitionFactor);
          }
        }
      }
      this.drawPath(ctx, this.path, this.isDrawing, color, 1, this.isDrawing ? this.currentMousePos : this.exitTipPos);
    }
  }
  drawRipples(ctx) {
    if (!this.puzzle) return;
    const time = (Date.now() - this.startTime) / 500;
    for (let r = 0; r <= this.puzzle.rows; r++) {
      for (let c = 0; c <= this.puzzle.cols; c++) {
        const node = this.puzzle.nodes[r][c];
        if (node.type === 2 /* End */) {
          const pos = this.getCanvasCoords(c, r);
          const dir = this.getExitDir(c, r);
          if (!dir) continue;
          const exitPos = {
            x: pos.x + dir.x * this.options.exitLength,
            y: pos.y + dir.y * this.options.exitLength
          };
          const t = time % 4;
          const radius = t * 5;
          const opacity = Math.max(0, 1 - t / 3);
          ctx.beginPath();
          ctx.arc(exitPos.x, exitPos.y, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(170, 170, 170, ${opacity * 0.4})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }
  }
  drawGrid(ctx) {
    if (!this.puzzle || !this.options.colors.grid) return;
    ctx.strokeStyle = this.options.colors.grid;
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    const drawEdge = (p1, p2, type) => {
      if (type === 2 /* Absent */) return;
      if (type === 1 /* Broken */) {
        const gapSize = 0.15;
        const q1 = {
          x: p1.x + (p2.x - p1.x) * (0.5 - gapSize),
          y: p1.y + (p2.y - p1.y) * (0.5 - gapSize)
        };
        const q2 = {
          x: p1.x + (p2.x - p1.x) * (0.5 + gapSize),
          y: p1.y + (p2.y - p1.y) * (0.5 + gapSize)
        };
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(q1.x, q1.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(q2.x, q2.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    };
    for (let r = 0; r <= this.puzzle.rows; r++) {
      for (let c = 0; c < this.puzzle.cols; c++) {
        drawEdge(this.getCanvasCoords(c, r), this.getCanvasCoords(c + 1, r), this.puzzle.hEdges[r][c].type);
      }
    }
    for (let r = 0; r < this.puzzle.rows; r++) {
      for (let c = 0; c <= this.puzzle.cols; c++) {
        drawEdge(this.getCanvasCoords(c, r), this.getCanvasCoords(c, r + 1), this.puzzle.vEdges[r][c].type);
      }
    }
  }
  drawConstraints(ctx) {
    if (!this.puzzle) return;
    const now = Date.now();
    const blinkFactor = (Math.sin(now * Math.PI * 2 / this.options.animations.blinkPeriod) + 1) / 2;
    for (let r = 0; r < this.puzzle.rows; r++) {
      for (let c = 0; c < this.puzzle.cols; c++) {
        const cell = this.puzzle.cells[r][c];
        const pos = this.getCanvasCoords(c + 0.5, r + 0.5);
        const isInvalidated = this.invalidatedCells.some((p) => p.x === c && p.y === r);
        const isError = this.errorCells.some((p) => p.x === c && p.y === r);
        let opacity = 1;
        let overrideColor = void 0;
        const originalColor = this.getColorCode(cell.color);
        const errorColor = this.options.colors.error;
        if (isError) {
          overrideColor = this.lerpColor(originalColor, errorColor, blinkFactor);
        }
        if (isInvalidated) {
          const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
          const blinkDuration = this.options.animations.blinkDuration;
          if (this.isFading) {
            opacity = this.fadeOpacity;
          } else if (elapsed < blinkDuration) {
            const transitionIn = Math.min(1, elapsed / 200);
            const transitionOut = elapsed > blinkDuration * 0.8 ? (blinkDuration - elapsed) / (blinkDuration * 0.2) : 1;
            const transitionFactor = Math.min(transitionIn, transitionOut);
            overrideColor = this.lerpColor(originalColor, errorColor, blinkFactor * transitionFactor);
          } else {
            opacity = Math.max(0.3, 1 - (elapsed - blinkDuration) / this.options.animations.fadeDuration);
          }
        }
        if (opacity < 1 || overrideColor) {
          const { canvas: tempCanvas, ctx: tempCtx } = this.prepareOffscreen();
          this.drawConstraintItem(tempCtx, cell, pos, overrideColor);
          ctx.save();
          ctx.globalAlpha = opacity;
          ctx.drawImage(tempCanvas, 0, 0);
          ctx.restore();
        } else {
          this.drawConstraintItem(ctx, cell, pos);
        }
      }
    }
    ctx.lineWidth = 2;
    const hexRadius = 8;
    for (let r = 0; r <= this.puzzle.rows; r++) {
      for (let c = 0; c < this.puzzle.cols; c++) {
        if (this.puzzle.hEdges[r][c].type === 3 /* Hexagon */) {
          const pos = this.getCanvasCoords(c + 0.5, r);
          ctx.save();
          const isInvalidated = this.invalidatedEdges.some((e) => e.type === "h" && e.r === r && e.c === c);
          const isError = this.errorEdges.some((e) => e.type === "h" && e.r === r && e.c === c);
          if (isError) {
            const color = this.lerpColor(this.options.colors.hexagon, this.options.colors.error, blinkFactor);
            this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
          } else if (isInvalidated) {
            const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
            const blinkDuration = this.options.animations.blinkDuration;
            if (this.isFading) ctx.globalAlpha *= this.fadeOpacity;
            else if (elapsed < blinkDuration) {
              const transitionIn = Math.min(1, elapsed / 200);
              const transitionOut = elapsed > blinkDuration * 0.8 ? (blinkDuration - elapsed) / (blinkDuration * 0.2) : 1;
              const transitionFactor = Math.min(transitionIn, transitionOut);
              const color = this.lerpColor(this.options.colors.hexagon, this.options.colors.error, blinkFactor * transitionFactor);
              this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
            } else {
              ctx.globalAlpha *= Math.max(0.3, 1 - (elapsed - blinkDuration) / this.options.animations.fadeDuration);
              this.drawHexagon(ctx, pos.x, pos.y, hexRadius);
            }
          } else {
            this.drawHexagon(ctx, pos.x, pos.y, hexRadius);
          }
          ctx.restore();
        }
      }
    }
    for (let r = 0; r < this.puzzle.rows; r++) {
      for (let c = 0; c <= this.puzzle.cols; c++) {
        if (this.puzzle.vEdges[r][c].type === 3 /* Hexagon */) {
          const pos = this.getCanvasCoords(c, r + 0.5);
          ctx.save();
          const isInvalidated = this.invalidatedEdges.some((e) => e.type === "v" && e.r === r && e.c === c);
          const isError = this.errorEdges.some((e) => e.type === "v" && e.r === r && e.c === c);
          if (isError) {
            const color = this.lerpColor(this.options.colors.hexagon, this.options.colors.error, blinkFactor);
            this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
          } else if (isInvalidated) {
            const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
            const blinkDuration = this.options.animations.blinkDuration;
            if (this.isFading) ctx.globalAlpha *= this.fadeOpacity;
            else if (elapsed < blinkDuration) {
              const transitionIn = Math.min(1, elapsed / 200);
              const transitionOut = elapsed > blinkDuration * 0.8 ? (blinkDuration - elapsed) / (blinkDuration * 0.2) : 1;
              const transitionFactor = Math.min(transitionIn, transitionOut);
              const color = this.lerpColor(this.options.colors.hexagon, this.options.colors.error, blinkFactor * transitionFactor);
              this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
            } else {
              ctx.globalAlpha *= Math.max(0.3, 1 - (elapsed - blinkDuration) / this.options.animations.fadeDuration);
              this.drawHexagon(ctx, pos.x, pos.y, hexRadius);
            }
          } else {
            this.drawHexagon(ctx, pos.x, pos.y, hexRadius);
          }
          ctx.restore();
        }
      }
    }
  }
  /**
   * 単一の制約アイテムを描画（座標はキャンバス全体に対する絶対座標）
   */
  drawConstraintItem(ctx, cell, pos, overrideColor) {
    if (cell.type === 1 /* Square */) {
      const size = 26;
      const radius = 8;
      ctx.fillStyle = overrideColor || this.getColorCode(cell.color);
      this.drawRoundedRect(ctx, pos.x - size / 2, pos.y - size / 2, size, size, radius);
    } else if (cell.type === 2 /* Star */) {
      this.drawStar(ctx, pos.x, pos.y, 12, 16, 8, cell.color, overrideColor);
    } else if (cell.type === 3 /* Tetris */ || cell.type === 4 /* TetrisRotated */) {
      this.drawTetris(ctx, pos.x, pos.y, cell.shape || [], cell.type === 4 /* TetrisRotated */, cell.color, overrideColor);
    } else if (cell.type === 5 /* Eraser */) {
      this.drawEraser(ctx, pos.x, pos.y, 14, 3, cell.color, overrideColor);
    }
  }
  drawNodes(ctx) {
    if (!this.puzzle) return;
    const isNodeIsolated = (c, r) => {
      const connectedEdges = [];
      if (c > 0) connectedEdges.push(this.puzzle.hEdges[r][c - 1].type);
      if (c < this.puzzle.cols) connectedEdges.push(this.puzzle.hEdges[r][c].type);
      if (r > 0) connectedEdges.push(this.puzzle.vEdges[r - 1][c].type);
      if (r < this.puzzle.rows) connectedEdges.push(this.puzzle.vEdges[r][c].type);
      return connectedEdges.length > 0 && connectedEdges.every((e) => e === 2 /* Absent */);
    };
    for (let r = 0; r <= this.puzzle.rows; r++) {
      for (let c = 0; c <= this.puzzle.cols; c++) {
        if (isNodeIsolated(c, r)) continue;
        const node = this.puzzle.nodes[r][c];
        const pos = this.getCanvasCoords(c, r);
        if (node.type === 1 /* Start */) {
          if (this.options.colors.node) ctx.fillStyle = this.options.colors.node;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, this.options.startNodeRadius, 0, Math.PI * 2);
          ctx.fill();
        } else if (node.type === 2 /* End */) {
          const dir = this.getExitDir(c, r);
          if (!dir) continue;
          if (this.options.colors.node) ctx.strokeStyle = this.options.colors.node;
          ctx.lineWidth = 12;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
          ctx.lineTo(pos.x + dir.x * this.options.exitLength, pos.y + dir.y * this.options.exitLength);
          ctx.stroke();
        } else {
          if (this.options.colors.node) ctx.fillStyle = this.options.colors.node;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, this.options.nodeRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  drawPath(ctx, path, isDrawing, color, opacity, tipPos = null) {
    if (path.length === 0 || !color) return;
    if (opacity < 1) {
      const { canvas: tempCanvas, ctx: tempCtx } = this.prepareOffscreen();
      this.drawPathInternal(tempCtx, path, isDrawing, color, tipPos);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.restore();
    } else {
      this.drawPathInternal(ctx, path, isDrawing, color, tipPos);
    }
  }
  drawPathInternal(ctx, path, isDrawing, color, tipPos = null) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = this.options.pathWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const startPos = this.getCanvasCoords(path[0].x, path[0].y);
    ctx.moveTo(startPos.x, startPos.y);
    for (let i = 1; i < path.length; i++) {
      const pos = this.getCanvasCoords(path[i].x, path[i].y);
      ctx.lineTo(pos.x, pos.y);
    }
    if (isDrawing || tipPos) {
      const pos = tipPos || this.currentMousePos;
      ctx.lineTo(pos.x, pos.y);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(startPos.x, startPos.y, this.options.startNodeRadius, 0, Math.PI * 2);
    ctx.fill();
    if (isDrawing) {
      ctx.beginPath();
      ctx.arc(this.currentMousePos.x, this.currentMousePos.y, this.options.pathWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }
  drawHexagon(ctx, x, y, radius, overrideColor) {
    if (!this.options.colors.hexagon && !overrideColor) return;
    ctx.fillStyle = overrideColor || this.options.colors.hexagon;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 3 * i;
      const px = x + radius * Math.cos(angle);
      const py = y + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  drawEraser(ctx, x, y, radius, points, colorEnum, overrideColor) {
    ctx.strokeStyle = overrideColor || this.getColorCode(colorEnum);
    ctx.lineWidth = radius * 0.5;
    ctx.lineCap = "butt";
    const rotation = 0.5;
    ctx.beginPath();
    for (let i = 0; i < points; i++) {
      const angle = Math.PI * 2 / points * i + rotation;
      const px = x + radius * Math.cos(angle);
      const py = y + radius * Math.sin(angle);
      ctx.moveTo(x, y);
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  drawStar(ctx, x, y, innerRadius, outerRadius, points, colorEnum, overrideColor) {
    ctx.fillStyle = overrideColor || this.getColorCode(colorEnum);
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = Math.PI / points * i;
      const px = x + radius * Math.cos(angle);
      const py = y + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  drawTetris(ctx, x, y, shape, rotated, colorEnum, overrideColor) {
    if (!shape || shape.length === 0) return;
    const cellSize = 12;
    const gap = 2;
    const totalW = shape[0].length * cellSize + (shape[0].length - 1) * gap;
    const totalH = shape.length * cellSize + (shape.length - 1) * gap;
    ctx.save();
    ctx.translate(x, y);
    if (rotated) {
      ctx.rotate(Math.PI / 8);
    }
    ctx.fillStyle = overrideColor || this.getColorCode(colorEnum, "#ffcc00");
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const px = c * (cellSize + gap) - totalW / 2;
          const py = r * (cellSize + gap) - totalH / 2;
          ctx.fillRect(px, py, cellSize, cellSize);
        }
      }
    }
    ctx.restore();
  }
  getColorCode(colorEnum, defaultFallback = "#666") {
    if (this.options.colors.colorList && this.options.colors.colorList[colorEnum] !== void 0) {
      return this.options.colors.colorList[colorEnum];
    }
    if (this.options.colors.colorMap && this.options.colors.colorMap[colorEnum] !== void 0) {
      return this.options.colors.colorMap[colorEnum];
    }
    return defaultFallback;
  }
  hexToRgb(hex) {
    let c = hex.startsWith("#") ? hex.slice(1) : hex;
    if (c.length === 3) {
      c = c.split("").map((s) => s + s).join("");
    }
    const i = parseInt(c, 16);
    return {
      r: i >> 16 & 255,
      g: i >> 8 & 255,
      b: i & 255
    };
  }
  rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  lerpColor(c1, c2, t) {
    try {
      const rgb1 = this.hexToRgb(c1);
      const rgb2 = this.hexToRgb(c2);
      return this.rgbToHex(Math.round(rgb1.r + (rgb2.r - rgb1.r) * t), Math.round(rgb1.g + (rgb2.g - rgb1.g) * t), Math.round(rgb1.b + (rgb2.b - rgb1.b) * t));
    } catch (e) {
      return c1;
    }
  }
  prepareOffscreen() {
    if (typeof document === "undefined") {
      return { canvas: {}, ctx: {} };
    }
    if (!this.offscreenCanvas) {
      this.offscreenCanvas = document.createElement("canvas");
      this.offscreenCtx = this.offscreenCanvas.getContext("2d");
    }
    if (this.offscreenCanvas.width !== this.canvas.width || this.offscreenCanvas.height !== this.canvas.height) {
      this.offscreenCanvas.width = this.canvas.width;
      this.offscreenCanvas.height = this.canvas.height;
    }
    this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
    return { canvas: this.offscreenCanvas, ctx: this.offscreenCtx };
  }
};

// src/index.ts
var WitnessCore = class {
  generator;
  validator;
  constructor() {
    this.generator = new PuzzleGenerator();
    this.validator = new PuzzleValidator();
  }
  /**
   * 新しいパズルを生成してデータを返す
   */
  createPuzzle(rows, cols, options = {}) {
    const grid = this.generator.generate(rows, cols, options);
    return grid.export();
  }
  /**
   * 解答を検証する
   */
  validateSolution(puzzleData, solution) {
    const grid = Grid.fromData(puzzleData);
    return this.validator.validate(grid, solution);
  }
  /**
   * パズルの難易度を計算する
   */
  calculateDifficulty(puzzleData) {
    const grid = Grid.fromData(puzzleData);
    return this.validator.calculateDifficulty(grid);
  }
};
export {
  CellType,
  Color,
  Direction,
  EdgeType,
  Grid,
  NodeType,
  PuzzleGenerator,
  PuzzleSerializer,
  PuzzleValidator,
  WitnessCore,
  WitnessUI
};
//# sourceMappingURL=MiniWitness.js.map
