/*!
 * MiniWitness 1.2.5
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
  CellType2[CellType2["TetrisNegative"] = 6] = "TetrisNegative";
  CellType2[CellType2["TetrisNegativeRotated"] = 7] = "TetrisNegativeRotated";
  return CellType2;
})(CellType || {});
var EdgeType = /* @__PURE__ */ ((EdgeType2) => {
  EdgeType2[EdgeType2["Normal"] = 0] = "Normal";
  EdgeType2[EdgeType2["Broken"] = 1] = "Broken";
  EdgeType2[EdgeType2["Absent"] = 2] = "Absent";
  EdgeType2[EdgeType2["Hexagon"] = 3] = "Hexagon";
  EdgeType2[EdgeType2["HexagonMain"] = 4] = "HexagonMain";
  EdgeType2[EdgeType2["HexagonSymmetry"] = 5] = "HexagonSymmetry";
  return EdgeType2;
})(EdgeType || {});
var NodeType = /* @__PURE__ */ ((NodeType2) => {
  NodeType2[NodeType2["Normal"] = 0] = "Normal";
  NodeType2[NodeType2["Start"] = 1] = "Start";
  NodeType2[NodeType2["End"] = 2] = "End";
  NodeType2[NodeType2["Hexagon"] = 3] = "Hexagon";
  NodeType2[NodeType2["HexagonMain"] = 4] = "HexagonMain";
  NodeType2[NodeType2["HexagonSymmetry"] = 5] = "HexagonSymmetry";
  return NodeType2;
})(NodeType || {});
var SymmetryType = /* @__PURE__ */ ((SymmetryType2) => {
  SymmetryType2[SymmetryType2["None"] = 0] = "None";
  SymmetryType2[SymmetryType2["Horizontal"] = 1] = "Horizontal";
  SymmetryType2[SymmetryType2["Vertical"] = 2] = "Vertical";
  SymmetryType2[SymmetryType2["Rotational"] = 3] = "Rotational";
  return SymmetryType2;
})(SymmetryType || {});
var Color = {
  None: 0,
  Black: 1,
  White: 2,
  Red: 3,
  Blue: 4,
  Cyan: 5
};

// src/grid.ts
var Grid = class _Grid {
  /** 行数 */
  rows;
  /** 列数 */
  cols;
  /** セルの制約（記号）マトリクス */
  cells = [];
  /** 水平エッジの制約マトリクス */
  hEdges = [];
  /** 垂直エッジの制約マトリクス */
  vEdges = [];
  /** ノードの制約マトリクス */
  nodes = [];
  /** 対称性の設定 (SymmetryType) */
  symmetry = 0;
  /**
   * 新しいグリッドを初期化する
   * @param rows 行数
   * @param cols 列数
   */
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.initializeGrid();
  }
  /**
   * グリッドの各要素を初期状態（制約なし）で生成する
   */
  initializeGrid() {
    this.cells = Array.from({ length: this.rows }, () => Array.from({ length: this.cols }, () => ({ type: 0 /* None */, color: Color.None })));
    this.hEdges = Array.from({ length: this.rows + 1 }, () => Array.from({ length: this.cols }, () => ({ type: 0 /* Normal */ })));
    this.vEdges = Array.from({ length: this.rows }, () => Array.from({ length: this.cols + 1 }, () => ({ type: 0 /* Normal */ })));
    this.nodes = Array.from({ length: this.rows + 1 }, () => Array.from({ length: this.cols + 1 }, () => ({ type: 0 /* Normal */ })));
  }
  /**
   * グリッドの状態を PuzzleData 形式でエクスポートする
   * @returns パズルデータ
   */
  export() {
    return JSON.parse(
      JSON.stringify({
        rows: this.rows,
        cols: this.cols,
        cells: this.cells,
        vEdges: this.vEdges,
        hEdges: this.hEdges,
        nodes: this.nodes,
        symmetry: this.symmetry
      })
    );
  }
  /**
   * PuzzleData から Grid インスタンスを生成する
   * @param data パズルデータ
   * @returns Grid インスタンス
   */
  static fromData(data) {
    const grid = new _Grid(data.rows, data.cols);
    grid.cells = data.cells;
    grid.vEdges = data.vEdges;
    grid.hEdges = data.hEdges;
    grid.nodes = data.nodes;
    grid.symmetry = data.symmetry || 0;
    return grid;
  }
};

// src/validator.ts
var PuzzleValidator = class {
  tetrisCache = /* @__PURE__ */ new Map();
  /**
   * 与えられたグリッドと回答パスが正当かどうかを検証する
   * @param grid パズルのグリッドデータ
   * @param solution 回答パス
   * @param externalCellsPrecalculated 既知の外部セル（高速化用）
   * @returns 検証結果（正誤、エラー理由、無効化された記号など）
   */
  validate(grid, solution, externalCellsPrecalculated) {
    const path = solution.points;
    if (path.length < 2) return { isValid: false, errorReason: "Path too short" };
    const symmetry = grid.symmetry || 0 /* None */;
    const symPath = [];
    if (symmetry !== 0 /* None */) {
      for (const p of path) {
        symPath.push(this.getSymmetricalPoint(grid, p));
      }
    }
    const start = path[0];
    const end = path[path.length - 1];
    if (grid.nodes[start.y][start.x].type !== 1 /* Start */) return { isValid: false, errorReason: "Must start at Start Node" };
    if (grid.nodes[end.y][end.x].type !== 2 /* End */) return { isValid: false, errorReason: "Must end at End Node" };
    if (symmetry !== 0 /* None */) {
      const symStart = symPath[0];
      const symEnd = symPath[symPath.length - 1];
      if (grid.nodes[symStart.y][symStart.x].type !== 1 /* Start */) return { isValid: false, errorReason: "Symmetrical path must start at Start Node" };
      if (grid.nodes[symEnd.y][symEnd.x].type !== 2 /* End */) return { isValid: false, errorReason: "Symmetrical path must end at End Node" };
    }
    const visitedNodes = /* @__PURE__ */ new Set();
    const visitedEdges = /* @__PURE__ */ new Set();
    visitedNodes.add(`${start.x},${start.y}`);
    if (symmetry !== 0 /* None */) {
      const symStart = symPath[0];
      if (visitedNodes.has(`${symStart.x},${symStart.y}`)) return { isValid: false, errorReason: "Paths collide at start" };
      visitedNodes.add(`${symStart.x},${symStart.y}`);
    }
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];
      const dist = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
      if (dist !== 1) return { isValid: false, errorReason: "Invalid jump in path" };
      const key = `${p2.x},${p2.y}`;
      if (visitedNodes.has(key)) return { isValid: false, errorReason: "Self-intersecting path or path collision" };
      visitedNodes.add(key);
      if (this.isBrokenEdge(grid, p1, p2)) return { isValid: false, errorReason: "Passed through broken edge" };
      visitedEdges.add(this.getEdgeKey(p1, p2));
      if (symmetry !== 0 /* None */) {
        const sp1 = symPath[i];
        const sp2 = symPath[i + 1];
        const symKey = `${sp2.x},${sp2.y}`;
        if (visitedNodes.has(symKey)) return { isValid: false, errorReason: "Path collision" };
        visitedNodes.add(symKey);
        if (this.isBrokenEdge(grid, sp1, sp2)) return { isValid: false, errorReason: "Symmetrical path passed through broken edge" };
        const edgeKey = this.getEdgeKey(sp1, sp2);
        if (visitedEdges.has(edgeKey)) return { isValid: false, errorReason: "Paths cross the same edge" };
        visitedEdges.add(edgeKey);
      }
    }
    const regions = this.calculateRegions(grid, path, symPath, externalCellsPrecalculated);
    const missed = this.getMissedHexagons(grid, path, symPath);
    const result = this.validateWithErasers(grid, regions, missed.edges, missed.nodes);
    result.regions = regions;
    return result;
  }
  /**
   * 高速化された検証（内部探索用）
   * @param grid グリッド
   * @param path メインパス
   * @param symPath 対称パス
   * @param externalCells 外部セルのキャッシュ
   * @returns 検証結果
   */
  validateFast(grid, path, symPath, externalCells) {
    const regions = this.calculateRegions(grid, path, symPath, externalCells);
    const missed = this.getMissedHexagons(grid, path, symPath);
    return this.validateWithErasers(grid, regions, missed.edges, missed.nodes);
  }
  /**
   * 二点間が断線（Broken or Absent）しているか確認する
   * @param grid グリッド
   * @param p1 点1
   * @param p2 点2
   * @returns 断線しているかどうか
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
   * @param grid グリッド
   * @param p1 点1
   * @param p2 点2
   * @returns 存在しないかどうか
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
   * 回答パスが通過しなかった六角形（エッジ・ノード）をリストアップする
   * @param grid グリッド
   * @param path メインパス
   * @param symPath 対称パス
   * @returns 通過しなかった六角形のリスト
   */
  getMissedHexagons(grid, path, symPath = []) {
    const mainPathEdges = /* @__PURE__ */ new Set();
    const mainPathNodes = /* @__PURE__ */ new Set();
    for (let i = 0; i < path.length; i++) {
      mainPathNodes.add(`${path[i].x},${path[i].y}`);
      if (i < path.length - 1) {
        mainPathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
      }
    }
    const symPathEdges = /* @__PURE__ */ new Set();
    const symPathNodes = /* @__PURE__ */ new Set();
    for (let i = 0; i < symPath.length; i++) {
      symPathNodes.add(`${symPath[i].x},${symPath[i].y}`);
      if (i < symPath.length - 1) {
        symPathEdges.add(this.getEdgeKey(symPath[i], symPath[i + 1]));
      }
    }
    const missedEdges = [];
    for (let r = 0; r <= grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const type = grid.hEdges[r][c].type;
        if (type === 3 /* Hexagon */ || type === 4 /* HexagonMain */ || type === 5 /* HexagonSymmetry */) {
          const key = this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r });
          let passed = false;
          if (type === 3 /* Hexagon */) passed = mainPathEdges.has(key) || symPathEdges.has(key);
          else if (type === 4 /* HexagonMain */) passed = mainPathEdges.has(key);
          else if (type === 5 /* HexagonSymmetry */) passed = symPathEdges.has(key);
          if (!passed) missedEdges.push({ type: "h", r, c });
        }
      }
    }
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c <= grid.cols; c++) {
        const type = grid.vEdges[r][c].type;
        if (type === 3 /* Hexagon */ || type === 4 /* HexagonMain */ || type === 5 /* HexagonSymmetry */) {
          const key = this.getEdgeKey({ x: c, y: r }, { x: c, y: r + 1 });
          let passed = false;
          if (type === 3 /* Hexagon */) passed = mainPathEdges.has(key) || symPathEdges.has(key);
          else if (type === 4 /* HexagonMain */) passed = mainPathEdges.has(key);
          else if (type === 5 /* HexagonSymmetry */) passed = symPathEdges.has(key);
          if (!passed) missedEdges.push({ type: "v", r, c });
        }
      }
    }
    const missedNodes = [];
    for (let r = 0; r <= grid.rows; r++) {
      for (let c = 0; c <= grid.cols; c++) {
        const type = grid.nodes[r][c].type;
        if (type === 3 /* Hexagon */ || type === 4 /* HexagonMain */ || type === 5 /* HexagonSymmetry */) {
          const posKey = `${c},${r}`;
          let passed = false;
          if (type === 3 /* Hexagon */) passed = mainPathNodes.has(posKey) || symPathNodes.has(posKey);
          else if (type === 4 /* HexagonMain */) passed = mainPathNodes.has(posKey);
          else if (type === 5 /* HexagonSymmetry */) passed = symPathNodes.has(posKey);
          if (!passed) missedNodes.push({ x: c, y: r });
        }
      }
    }
    return { edges: missedEdges, nodes: missedNodes };
  }
  /**
   * テトラポッド（エラー削除）を考慮してパズルの各制約を検証する
   * @param grid グリッド
   * @param regions 区画リスト
   * @param missedHexagons 通過しなかったエッジ六角形
   * @param missedNodeHexagons 通過しなかったノード六角形
   * @returns 検証結果
   */
  validateWithErasers(grid, regions, missedHexagons, missedNodeHexagons) {
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
      const adjacentMissedNodeHexagons = [];
      for (let j = 0; j < missedNodeHexagons.length; j++) {
        if (this.isNodeHexagonAdjacentToRegion(grid, missedNodeHexagons[j], region)) adjacentMissedNodeHexagons.push(j);
      }
      const possible = this.getPossibleErasures(grid, region, erasers, otherMarks, adjacentMissedHexagons, adjacentMissedNodeHexagons);
      if (possible.length === 0) {
        allRegionsPossiblyValid = false;
        const bestEffort = this.getBestEffortErasures(grid, region, erasers, otherMarks, adjacentMissedHexagons, adjacentMissedNodeHexagons);
        regionResults.push([bestEffort]);
      } else {
        possible.sort((a, b) => {
          const costA = a.invalidatedCells.length + a.invalidatedHexagons.length + a.invalidatedNodeHexagons.length;
          const costB = b.invalidatedCells.length + b.invalidatedHexagons.length + b.invalidatedNodeHexagons.length;
          return costA - costB;
        });
        regionResults.push(possible);
      }
    }
    if (allRegionsPossiblyValid) {
      const assignment = this.findGlobalAssignment(regionResults, missedHexagons.length, missedNodeHexagons.length);
      if (assignment) {
        return {
          isValid: true,
          invalidatedCells: assignment.invalidatedCells,
          invalidatedEdges: assignment.invalidatedHexIndices.map((idx) => missedHexagons[idx]),
          invalidatedNodes: assignment.invalidatedNodeHexIndices.map((idx) => missedNodeHexagons[idx])
        };
      }
    }
    const errorCells = [];
    const invalidatedCells = [];
    const invalidatedHexIndices = /* @__PURE__ */ new Set();
    const invalidatedNodeHexIndices = /* @__PURE__ */ new Set();
    for (const options of regionResults) {
      const best = options[0];
      errorCells.push(...best.errorCells);
      invalidatedCells.push(...best.invalidatedCells);
      for (const idx of best.invalidatedHexagons) invalidatedHexIndices.add(idx);
      for (const idx of best.invalidatedNodeHexagons) invalidatedNodeHexIndices.add(idx);
    }
    const errorEdges = [];
    for (let i = 0; i < missedHexagons.length; i++) {
      if (!invalidatedHexIndices.has(i)) {
        errorEdges.push(missedHexagons[i]);
      }
    }
    const errorNodes = [];
    for (let i = 0; i < missedNodeHexagons.length; i++) {
      if (!invalidatedNodeHexIndices.has(i)) {
        errorNodes.push(missedNodeHexagons[i]);
      }
    }
    return {
      isValid: false,
      errorReason: "Constraints failed",
      errorCells,
      errorEdges,
      errorNodes,
      invalidatedCells,
      invalidatedEdges: Array.from(invalidatedHexIndices).map((idx) => missedHexagons[idx]),
      invalidatedNodes: Array.from(invalidatedNodeHexIndices).map((idx) => missedNodeHexagons[idx])
    };
  }
  /**
   * 指定されたエッジが特定の区画に隣接しているか確認する
   * @param grid グリッド
   * @param hex 六角形エッジ
   * @param region 区画
   * @returns 隣接しているかどうか
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
   * 指定されたノードが特定の区画に隣接しているか確認する
   * @param grid グリッド
   * @param node ノード座標
   * @param region 区画
   * @returns 隣接しているかどうか
   */
  isNodeHexagonAdjacentToRegion(grid, node, region) {
    const regionCells = new Set(region.map((p) => `${p.x},${p.y}`));
    const adjCells = [
      { x: node.x - 1, y: node.y - 1 },
      { x: node.x, y: node.y - 1 },
      { x: node.x - 1, y: node.y },
      { x: node.x, y: node.y }
    ];
    for (const cell of adjCells) {
      if (cell.x >= 0 && cell.x < grid.cols && cell.y >= 0 && cell.y < grid.rows) {
        if (regionCells.has(`${cell.x},${cell.y}`)) return true;
      }
    }
    return false;
  }
  /**
   * 区画内のエラー削除可能な全パターンを取得する
   * @param grid グリッド
   * @param region 区画
   * @param erasers 消しゴムのリスト
   * @param otherMarks 他の記号のリスト
   * @param adjacentMissedHexagons 隣接する未通過エッジ六角形
   * @param adjacentMissedNodeHexagons 隣接する未通過ノード六角形
   * @returns 可能な削除パターンのリスト
   */
  getPossibleErasures(grid, region, erasers, otherMarks, adjacentMissedHexagons, adjacentMissedNodeHexagons) {
    const results = [];
    const numErasers = erasers.length;
    if (numErasers === 0) {
      const errorCells = this.getRegionErrors(grid, region, []);
      if (errorCells.length === 0 && adjacentMissedHexagons.length === 0 && adjacentMissedNodeHexagons.length === 0) {
        results.push({ invalidatedCells: [], invalidatedHexagons: [], invalidatedNodeHexagons: [], isValid: true, errorCells: [] });
      }
      return results;
    }
    const itemsToNegate = [...otherMarks.map((p) => ({ type: "cell", pos: p })), ...adjacentMissedHexagons.map((idx) => ({ type: "hex", index: idx })), ...adjacentMissedNodeHexagons.map((idx) => ({ type: "nodeHex", index: idx }))];
    const initiallyValid = this.getRegionErrors(grid, region, []).length === 0 && adjacentMissedHexagons.length === 0 && adjacentMissedNodeHexagons.length === 0;
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
            const negatedNodeHexIndices = negatedItems.filter((it) => it.type === "nodeHex").map((it) => it.index);
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
                  const subsetNodeHexIndices = new Set(subset.filter((it) => it.type === "nodeHex").map((it) => it.index));
                  const allHexSatisfied = adjacentMissedHexagons.every((idx) => subsetHexIndices.has(idx));
                  const allNodeHexSatisfied = adjacentMissedNodeHexagons.every((idx) => subsetNodeHexIndices.has(idx));
                  if (this.getRegionErrors(grid, region, subsetCells).length === 0 && allHexSatisfied && allNodeHexSatisfied) {
                    isUseful = false;
                    break;
                  }
                }
              }
              if (isUseful) {
                results.push({
                  invalidatedCells: [...negatedCells, ...negatedErasers],
                  invalidatedHexagons: negatedHexIndices,
                  invalidatedNodeHexagons: negatedNodeHexIndices,
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
   * エラーが解消できなかった場合のベストエフォートな削除（可能な限り消しゴムを適用）を取得する
   * @param grid グリッド
   * @param region 区画
   * @param erasers 消しゴムのリスト
   * @param otherMarks 他の記号のリスト
   * @param adjacentMissedHexagons 隣接する未通過エッジ六角形
   * @param adjacentMissedNodeHexagons 隣接する未通過ノード六角形
   * @returns ベストエフォートな削除結果
   */
  getBestEffortErasures(grid, region, erasers, otherMarks, adjacentMissedHexagons, adjacentMissedNodeHexagons) {
    const naturalErrors = this.getRegionErrors(grid, region, []);
    const initiallyValid = naturalErrors.length === 0 && adjacentMissedHexagons.length === 0 && adjacentMissedNodeHexagons.length === 0;
    if (initiallyValid) {
      return {
        invalidatedCells: [],
        invalidatedHexagons: [],
        invalidatedNodeHexagons: [],
        isValid: false,
        errorCells: [...erasers]
      };
    }
    if (erasers.length > 0) {
      const itemsToNegate = [...otherMarks.map((p) => ({ type: "cell", pos: p })), ...adjacentMissedHexagons.map((idx) => ({ type: "hex", index: idx })), ...adjacentMissedNodeHexagons.map((idx) => ({ type: "nodeHex", index: idx }))];
      let bestResult = null;
      let minErrorCount = Infinity;
      const tryNegate = (priorityItems) => {
        const toInvalidateCells = [];
        const toInvalidateHexagons = [];
        const toInvalidateNodeHexagons = [];
        let usedErasersCount = 0;
        for (const item of priorityItems) {
          if (usedErasersCount < erasers.length) {
            if (item.type === "cell") toInvalidateCells.push(item.pos);
            else if (item.type === "hex") toInvalidateHexagons.push(item.index);
            else toInvalidateNodeHexagons.push(item.index);
            usedErasersCount++;
          }
        }
        const remainingForPairs = erasers.length - usedErasersCount;
        const N = Math.floor(remainingForPairs / 2);
        const negatedErasers = erasers.slice(usedErasersCount, usedErasersCount + N);
        usedErasersCount += N * 2;
        const errorCells2 = this.getRegionErrors(grid, region, [...toInvalidateCells, ...negatedErasers]);
        for (let i = usedErasersCount; i < erasers.length; i++) {
          errorCells2.push(erasers[i]);
        }
        const errorCount = errorCells2.length;
        if (errorCount < minErrorCount) {
          minErrorCount = errorCount;
          bestResult = {
            invalidatedCells: [...toInvalidateCells, ...negatedErasers],
            invalidatedHexagons: toInvalidateHexagons,
            invalidatedNodeHexagons: toInvalidateNodeHexagons,
            isValid: false,
            errorCells: errorCells2
          };
        }
      };
      tryNegate([...naturalErrors.map((p) => ({ type: "cell", pos: p })), ...adjacentMissedHexagons.map((idx) => ({ type: "hex", index: idx })), ...adjacentMissedNodeHexagons.map((idx) => ({ type: "nodeHex", index: idx }))]);
      tryNegate(itemsToNegate);
      for (const errCell of naturalErrors) {
        tryNegate([{ type: "cell", pos: errCell }]);
      }
      if (bestResult) return bestResult;
    }
    const errorCells = [...naturalErrors, ...erasers];
    return {
      invalidatedCells: [],
      invalidatedHexagons: [],
      invalidatedNodeHexagons: [],
      isValid: false,
      errorCells
    };
  }
  /**
   * 配列からN個選ぶ組み合わせを取得する
   * @param items 配列
   * @param n 選択する数
   * @returns 組み合わせのリスト
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
   * @param grid グリッド
   * @param region 区画
   * @param erasedCells 無効化されたセルのリスト
   * @returns 有効かどうか
   */
  checkRegionValid(grid, region, erasedCells) {
    return this.getRegionErrors(grid, region, erasedCells).length === 0;
  }
  /**
   * 区画内のエラーとなっているセルを特定する
   * @param grid グリッド
   * @param region 区画
   * @param erasedCells 無効化されたセルのリスト
   * @returns エラーセルのリスト
   */
  getRegionErrors(grid, region, erasedCells) {
    const erasedSet = new Set(erasedCells.map((p) => `${p.x},${p.y}`));
    const colorCounts = /* @__PURE__ */ new Map();
    const colorCells = /* @__PURE__ */ new Map();
    const starColors = /* @__PURE__ */ new Set();
    const squareColors = /* @__PURE__ */ new Set();
    const tetrisPieces = [];
    const tetrisNegativePieces = [];
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
      } else if (constraint.type === 6 /* TetrisNegative */ || constraint.type === 7 /* TetrisNegativeRotated */) {
        if (constraint.shape) tetrisNegativePieces.push({ shape: constraint.shape, rotatable: constraint.type === 7 /* TetrisNegativeRotated */, pos: cell });
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
          if (type === 2 /* Star */) {
            errorCells.push(p);
          }
        }
      }
    }
    if (tetrisPieces.length > 0 || tetrisNegativePieces.length > 0) {
      if (!this.checkTetrisConstraint(
        grid,
        region,
        tetrisPieces.map((p) => ({ shape: p.shape, rotatable: p.rotatable })),
        tetrisNegativePieces.map((p) => ({ shape: p.shape, rotatable: p.rotatable }))
      )) {
        for (const p of tetrisPieces) errorCells.push(p.pos);
        for (const p of tetrisNegativePieces) errorCells.push(p.pos);
      }
    }
    return errorCells;
  }
  /**
   * グローバルな制約（六角形）の割り当てをバックトラッキングで探索する
   * @param regionResults 各区画の削除候補リスト
   * @param totalMissedHexagons 合計未通過エッジ六角形数
   * @param totalMissedNodeHexagons 合計未通過ノード六角形数
   * @returns 成功した場合は割り当て結果、失敗した場合はnull
   */
  findGlobalAssignment(regionResults, totalMissedHexagons, totalMissedNodeHexagons) {
    const numRegions = regionResults.length;
    const currentHexErasures = new Array(totalMissedHexagons).fill(0);
    const currentNodeHexErasures = new Array(totalMissedNodeHexagons).fill(0);
    const allInvalidatedCells = [];
    const allInvalidatedHexIndices = [];
    const allInvalidatedNodeHexIndices = [];
    const backtrack = (regionIdx) => {
      if (regionIdx === numRegions) return currentHexErasures.every((count) => count === 1) && currentNodeHexErasures.every((count) => count === 1);
      for (const option of regionResults[regionIdx]) {
        let possible = true;
        for (const hexIdx of option.invalidatedHexagons)
          if (currentHexErasures[hexIdx] > 0) {
            possible = false;
            break;
          }
        if (possible) {
          for (const hexIdx of option.invalidatedNodeHexagons)
            if (currentNodeHexErasures[hexIdx] > 0) {
              possible = false;
              break;
            }
        }
        if (possible) {
          for (const hexIdx of option.invalidatedHexagons) {
            currentHexErasures[hexIdx]++;
            allInvalidatedHexIndices.push(hexIdx);
          }
          for (const hexIdx of option.invalidatedNodeHexagons) {
            currentNodeHexErasures[hexIdx]++;
            allInvalidatedNodeHexIndices.push(hexIdx);
          }
          allInvalidatedCells.push(...option.invalidatedCells);
          if (backtrack(regionIdx + 1)) return true;
          for (const hexIdx of option.invalidatedHexagons) {
            currentHexErasures[hexIdx]--;
            allInvalidatedHexIndices.pop();
          }
          for (const hexIdx of option.invalidatedNodeHexagons) {
            currentNodeHexErasures[hexIdx]--;
            allInvalidatedNodeHexIndices.pop();
          }
          for (let i = 0; i < option.invalidatedCells.length; i++) allInvalidatedCells.pop();
        }
      }
      return false;
    };
    if (backtrack(0))
      return {
        invalidatedCells: allInvalidatedCells,
        invalidatedHexIndices: allInvalidatedHexIndices,
        invalidatedNodeHexIndices: allInvalidatedNodeHexIndices
      };
    return null;
  }
  /**
   * テトリス制約の検証
   * 領域内の全てのテトリスピース（正・負）を盤面内に配置し、
   * 各セルの合計値が「領域内なら1、領域外なら0」になる配置が存在するかを確認する。
   * 重なりは許容されるが、最終的な合計がマイナスになることは許されない。
   * また、全てのピースはパズル（グリッド）の範囲内に収まっている必要がある。
   * @param gridObj グリッドオブジェクト
   * @param region 区画
   * @param pieces 正のテトリスピース
   * @param negativePieces 負のテトリスピース
   */
  checkTetrisConstraint(gridObj, region, pieces, negativePieces = []) {
    const positiveArea = pieces.reduce((sum, p) => sum + this.getShapeArea(p.shape), 0);
    const negativeArea = negativePieces.reduce((sum, p) => sum + this.getShapeArea(p.shape), 0);
    const netArea = positiveArea - negativeArea;
    if (netArea < 0) return false;
    if (netArea !== 0 && netArea !== region.length) return false;
    const rows = gridObj.rows;
    const cols = gridObj.cols;
    if (this.tetrisCache.size > 1e4) this.tetrisCache.clear();
    const regionMask = new Uint8Array(rows * cols);
    for (const p of region) regionMask[p.y * cols + p.x] = 1;
    const pieceKey = (p, sign) => `${this.getShapeKey(p.shape)}-${p.rotatable}-${sign}`;
    const piecesKey = [...pieces.map((p) => pieceKey(p, 1)), ...negativePieces.map((p) => pieceKey(p, -1))].sort().join("|");
    const cacheKey = `${rows}x${cols}:${regionMask.join("")}:${piecesKey}`;
    if (this.tetrisCache.has(cacheKey)) return this.tetrisCache.get(cacheKey);
    const target = new Int8Array(rows * cols);
    if (netArea > 0) {
      for (let i = 0; i < regionMask.length; i++) target[i] = regionMask[i];
    }
    const current = new Int8Array(rows * cols);
    const pieceGroups = [];
    const allPieces = [...pieces.map((p) => ({ ...p, sign: 1 })), ...negativePieces.map((p) => ({ ...p, sign: -1 }))];
    for (const p of allPieces) {
      const rotations = p.rotatable ? this.getAllRotations(p.shape) : [p.shape];
      const baseShapeKey = this.getShapeKey(rotations[0]);
      let group = pieceGroups.find((g) => g.sign === p.sign && (p.rotatable ? g.rotations.length > 1 : g.rotations.length === 1) && this.getShapeKey(g.rotations[0].shape) === baseShapeKey);
      if (group) {
        group.count++;
      } else {
        pieceGroups.push({
          rotations: rotations.map((r) => ({ shape: r, h: r.length, w: r[0].length })),
          sign: p.sign,
          area: this.getShapeArea(p.shape),
          count: 1
        });
      }
    }
    pieceGroups.sort((a, b) => b.sign - a.sign || b.area - a.area);
    let posMismatch = netArea > 0 ? region.length : 0;
    let negMismatch = 0;
    let totalPositiveAreaLeft = positiveArea;
    let totalNegativeAreaLeft = negativeArea;
    const backtrack = (groupIdx, countInGroup, lastPos) => {
      if (posMismatch > totalPositiveAreaLeft || negMismatch > totalNegativeAreaLeft) return false;
      if (groupIdx === pieceGroups.length) {
        return posMismatch === 0 && negMismatch === 0;
      }
      const group = pieceGroups[groupIdx];
      const nextCount = countInGroup + 1;
      const isLastInGroup = nextCount === group.count;
      if (group.sign === 1) totalPositiveAreaLeft -= group.area;
      else totalNegativeAreaLeft -= group.area;
      for (const rot of group.rotations) {
        const h = rot.h;
        const w = rot.w;
        const startPos = countInGroup === 0 ? 0 : lastPos;
        for (let pos = startPos; pos <= rows * cols - (h > 0 ? (h - 1) * cols + w : 0); pos++) {
          const r = Math.floor(pos / cols);
          const c = pos % cols;
          if (r > rows - h || c > cols - w) continue;
          let possible = true;
          const placedIndices = [];
          for (let pr = 0; pr < h; pr++) {
            for (let pc = 0; pc < w; pc++) {
              if (rot.shape[pr][pc]) {
                const tidx = (r + pr) * cols + (c + pc);
                if (group.sign === 1) {
                  if (current[tidx] < target[tidx]) posMismatch--;
                  else negMismatch++;
                } else {
                  if (current[tidx] <= target[tidx]) posMismatch++;
                  else negMismatch--;
                }
                current[tidx] += group.sign;
                placedIndices.push(tidx);
                if (current[tidx] < 0) possible = false;
                if (group.sign === 1 && current[tidx] > 1 + negativeArea) possible = false;
              }
            }
            if (!possible) break;
          }
          if (possible) {
            if (isLastInGroup) {
              if (backtrack(groupIdx + 1, 0, 0)) {
                for (const tidx of placedIndices) {
                  current[tidx] -= group.sign;
                  if (group.sign === 1) {
                    if (current[tidx] < target[tidx]) posMismatch++;
                    else negMismatch--;
                  } else {
                    if (current[tidx] <= target[tidx]) posMismatch--;
                    else negMismatch++;
                  }
                }
                if (group.sign === 1) totalPositiveAreaLeft += group.area;
                else totalNegativeAreaLeft += group.area;
                return true;
              }
            } else {
              if (backtrack(groupIdx, nextCount, pos)) {
                for (const tidx of placedIndices) {
                  current[tidx] -= group.sign;
                  if (group.sign === 1) {
                    if (current[tidx] < target[tidx]) posMismatch++;
                    else negMismatch--;
                  } else {
                    if (current[tidx] <= target[tidx]) posMismatch--;
                    else negMismatch++;
                  }
                }
                if (group.sign === 1) totalPositiveAreaLeft += group.area;
                else totalNegativeAreaLeft += group.area;
                return true;
              }
            }
          }
          for (const tidx of placedIndices) {
            current[tidx] -= group.sign;
            if (group.sign === 1) {
              if (current[tidx] < target[tidx]) posMismatch++;
              else negMismatch--;
            } else {
              if (current[tidx] <= target[tidx]) posMismatch--;
              else negMismatch++;
            }
          }
        }
      }
      if (group.sign === 1) totalPositiveAreaLeft += group.area;
      else totalNegativeAreaLeft += group.area;
      return false;
    };
    const res = backtrack(0, 0, 0);
    this.tetrisCache.set(cacheKey, res);
    return res;
  }
  getShapeArea(shape) {
    let area = 0;
    for (const row of shape) for (const cell of row) if (cell) area++;
    return area;
  }
  getShapeKey(shape) {
    return JSON.stringify(shape);
  }
  /**
   * 再帰的にタイリングを試みる
   * @param regionGrid 領域のグリッド表現
   * @param pieces 残りのピース
   * @returns タイリング可能かどうか
   */
  getAllRotations(shape) {
    const results = [];
    const keys = /* @__PURE__ */ new Set();
    let curr = shape;
    for (let i = 0; i < 4; i++) {
      const key = this.getShapeKey(curr);
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
   * @param grid グリッド
   * @param path メインパス
   * @param symPath 対称パス
   * @param externalCellsPrecalculated 外部セルのキャッシュ
   * @returns 区画リスト
   */
  calculateRegions(grid, path, symPath = [], externalCellsPrecalculated) {
    const regions = [];
    const rows = grid.rows;
    const cols = grid.cols;
    const visitedCells = new Uint8Array(rows * cols);
    const hEdgesMask = new Uint8Array((rows + 1) * cols);
    const vEdgesMask = new Uint8Array(rows * (cols + 1));
    const setEdge = (p1, p2) => {
      if (p1.x === p2.x) {
        vEdgesMask[Math.min(p1.y, p2.y) * (cols + 1) + p1.x] = 1;
      } else {
        hEdgesMask[p1.y * cols + Math.min(p1.x, p2.x)] = 1;
      }
    };
    for (let i = 0; i < path.length - 1; i++) setEdge(path[i], path[i + 1]);
    for (let i = 0; i < symPath.length - 1; i++) setEdge(symPath[i], symPath[i + 1]);
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid.hEdges[r][c].type === 2 /* Absent */) hEdgesMask[r * cols + c] = 1;
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c <= cols; c++) {
        if (grid.vEdges[r][c].type === 2 /* Absent */) vEdgesMask[r * (cols + 1) + c] = 1;
      }
    }
    const externalCells = externalCellsPrecalculated || this.getExternalCells(grid);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (visitedCells[idx] || externalCells && externalCells.has(`${c},${r}`)) continue;
        const region = [];
        const queue = [idx];
        visitedCells[idx] = 1;
        let head = 0;
        while (head < queue.length) {
          const currIdx = queue[head++];
          const cx = currIdx % cols;
          const cy = Math.floor(currIdx / cols);
          region.push({ x: cx, y: cy });
          if (cy > 0 && !hEdgesMask[cy * cols + cx]) {
            const nIdx = (cy - 1) * cols + cx;
            if (!visitedCells[nIdx] && (!externalCells || !externalCells.has(`${cx},${cy - 1}`))) {
              visitedCells[nIdx] = 1;
              queue.push(nIdx);
            }
          }
          if (cy < rows - 1 && !hEdgesMask[(cy + 1) * cols + cx]) {
            const nIdx = (cy + 1) * cols + cx;
            if (!visitedCells[nIdx] && (!externalCells || !externalCells.has(`${cx},${cy + 1}`))) {
              visitedCells[nIdx] = 1;
              queue.push(nIdx);
            }
          }
          if (cx > 0 && !vEdgesMask[cy * (cols + 1) + cx]) {
            const nIdx = cy * cols + (cx - 1);
            if (!visitedCells[nIdx] && (!externalCells || !externalCells.has(`${cx - 1},${cy}`))) {
              visitedCells[nIdx] = 1;
              queue.push(nIdx);
            }
          }
          if (cx < cols - 1 && !vEdgesMask[cy * (cols + 1) + (cx + 1)]) {
            const nIdx = cy * cols + (cx + 1);
            if (!visitedCells[nIdx] && (!externalCells || !externalCells.has(`${cx + 1},${cy}`))) {
              visitedCells[nIdx] = 1;
              queue.push(nIdx);
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
   * @param grid グリッド
   * @returns 外部セルのセット
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
  getSymmetricalPoint(grid, p) {
    const symmetry = grid.symmetry || 0 /* None */;
    if (symmetry === 1 /* Horizontal */) {
      return { x: grid.cols - p.x, y: p.y };
    } else if (symmetry === 2 /* Vertical */) {
      return { x: p.x, y: grid.rows - p.y };
    } else if (symmetry === 3 /* Rotational */) {
      return { x: grid.cols - p.x, y: grid.rows - p.y };
    }
    return { ...p };
  }
  getSymmetricalPointIndex(grid, idx) {
    const nodeCols = grid.cols + 1;
    const r = Math.floor(idx / nodeCols);
    const c = idx % nodeCols;
    const symmetry = grid.symmetry || 0 /* None */;
    let sr = r, sc = c;
    if (symmetry === 1 /* Horizontal */) {
      sc = grid.cols - c;
    } else if (symmetry === 2 /* Vertical */) {
      sr = grid.rows - r;
    } else if (symmetry === 3 /* Rotational */) {
      sc = grid.cols - c;
      sr = grid.rows - r;
    }
    return sr * nodeCols + sc;
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
    const hexIdMap = /* @__PURE__ */ new Map();
    let nextHexId = 0;
    const hexagonEdges = /* @__PURE__ */ new Set();
    const hexagonNodes = /* @__PURE__ */ new Set();
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const u = r * nodeCols + c;
        if (grid.nodes[r][c].type === 1 /* Start */) startNodes.push(u);
        if (grid.nodes[r][c].type === 2 /* End */) endNodes.push(u);
        if (grid.nodes[r][c].type === 3 /* Hexagon */ || grid.nodes[r][c].type === 4 /* HexagonMain */ || grid.nodes[r][c].type === 5 /* HexagonSymmetry */) {
          hexIdMap.set(`n${c},${r}`, nextHexId++);
          hexagonNodes.add(u);
        }
        if (c < cols) {
          const v = u + 1;
          const type = grid.hEdges[r][c].type;
          const isHexagon = type === 3 /* Hexagon */ || type === 4 /* HexagonMain */ || type === 5 /* HexagonSymmetry */;
          const isBroken = type === 1 /* Broken */ || type === 2 /* Absent */;
          adj[u].push({ next: v, hexType: type, isBroken });
          adj[v].push({ next: u, hexType: type, isBroken });
          if (isHexagon) {
            hexIdMap.set(`eh${c},${r}`, nextHexId++);
            hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r }));
          }
        }
        if (r < rows) {
          const v = u + nodeCols;
          const type = grid.vEdges[r][c].type;
          const isHexagon = type === 3 /* Hexagon */ || type === 4 /* HexagonMain */ || type === 5 /* HexagonSymmetry */;
          const isBroken = type === 1 /* Broken */ || type === 2 /* Absent */;
          adj[u].push({ next: v, hexType: type, isBroken });
          adj[v].push({ next: u, hexType: type, isBroken });
          if (isHexagon) {
            hexIdMap.set(`ev${c},${r}`, nextHexId++);
            hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c, y: r + 1 }));
          }
        }
      }
    }
    const stats = { totalNodesVisited: 0, branchingPoints: 0, solutions: 0, maxDepth: 0, backtracks: 0 };
    const totalHexagons = nextHexId;
    const fingerprints = /* @__PURE__ */ new Set();
    const searchLimit = Math.max(1e3, rows * cols * 200);
    const externalCells = this.getExternalCells(grid);
    let hasCellMarks = false;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid.cells[r][c].type !== 0 /* None */) {
          hasCellMarks = true;
          break;
        }
      }
      if (hasCellMarks) break;
    }
    this.tetrisCache.clear();
    for (const startIdx of startNodes) {
      const nodeCols2 = grid.cols + 1;
      const r = Math.floor(startIdx / nodeCols2);
      const c = startIdx % nodeCols2;
      let startHexMask = 0n;
      const nodeType = grid.nodes[r][c].type;
      if (nodeType === 3 /* Hexagon */ || nodeType === 4 /* HexagonMain */) {
        startHexMask |= 1n << BigInt(hexIdMap.get(`n${c},${r}`));
      }
      const symmetry = grid.symmetry || 0 /* None */;
      if (symmetry !== 0 /* None */) {
        const snStart = this.getSymmetricalPointIndex(grid, startIdx);
        const snR = Math.floor(snStart / nodeCols2);
        const snC = snStart % nodeCols2;
        const snNodeType = grid.nodes[snR][snC].type;
        if (snNodeType === 3 /* Hexagon */ || snNodeType === 5 /* HexagonSymmetry */) {
          startHexMask |= 1n << BigInt(hexIdMap.get(`n${snC},${snR}`));
        }
      }
      let visitedMask = 1n << BigInt(startIdx);
      if (symmetry !== 0 /* None */) {
        const snStart = this.getSymmetricalPointIndex(grid, startIdx);
        if (snStart === startIdx) continue;
        visitedMask |= 1n << BigInt(snStart);
      }
      this.exploreSearchSpace(grid, startIdx, visitedMask, [startIdx], startHexMask, totalHexagons, adj, endNodes, fingerprints, stats, searchLimit, externalCells, hasCellMarks, hexIdMap);
    }
    if (stats.solutions === 0) return 0;
    let constraintCount = hexagonEdges.size + hexagonNodes.size;
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
    difficulty -= hexagonEdges.size * 0.05;
    difficulty += hexagonNodes.size * 0.12;
    if (tetrisCount > 0) {
      difficulty += (tetrisCount - rotatedTetrisCount) * 0.5;
      difficulty += rotatedTetrisCount * 0.2;
    }
    let negTetrisCount = 0;
    let rotatedNegTetrisCount = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid.cells[r][c];
        if (cell.type === 6 /* TetrisNegative */) negTetrisCount++;
        else if (cell.type === 7 /* TetrisNegativeRotated */) {
          negTetrisCount++;
          rotatedNegTetrisCount++;
        }
      }
    }
    if (negTetrisCount > 0) {
      difficulty += (negTetrisCount - rotatedNegTetrisCount) * 0.6;
      difficulty += rotatedNegTetrisCount * 0.3;
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
  exploreSearchSpace(grid, currIdx, visitedMask, path, hexMask, totalHexagons, adj, endNodes, fingerprints, stats, limit, externalCells, hasCellMarks = true, hexIdMap) {
    stats.totalNodesVisited++;
    stats.maxDepth = Math.max(stats.maxDepth, path.length);
    if (stats.totalNodesVisited > limit) return;
    const symmetry = grid.symmetry || 0 /* None */;
    if (endNodes.includes(currIdx)) {
      let setBits = 0;
      let temp = hexMask;
      while (temp > 0n) {
        if (temp & 1n) setBits++;
        temp >>= 1n;
      }
      if (setBits === totalHexagons) {
        const points = path.map((idx) => ({ x: idx % (grid.cols + 1), y: Math.floor(idx / (grid.cols + 1)) }));
        const solutionPath = { points };
        if (symmetry !== 0 /* None */) {
          const snEnd = this.getSymmetricalPointIndex(grid, currIdx);
          const nodeCols2 = grid.cols + 1;
          if (grid.nodes[Math.floor(snEnd / nodeCols2)][snEnd % nodeCols2].type !== 2 /* End */) return;
        }
        const symPathPoints = symmetry !== 0 /* None */ ? points.map((p) => this.getSymmetricalPoint(grid, p)) : [];
        if (!hasCellMarks) {
          const fp = this.getFingerprint(grid, points, symPathPoints, void 0, externalCells);
          if (!fingerprints.has(fp)) {
            fingerprints.add(fp);
            stats.solutions++;
          }
        } else {
          const result = this.validateFast(grid, points, symPathPoints, externalCells);
          if (result.isValid) {
            const fp = this.getFingerprint(grid, points, symPathPoints, result.regions, externalCells);
            if (!fingerprints.has(fp)) {
              fingerprints.add(fp);
              stats.solutions++;
            }
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
      if (symmetry !== 0 /* None */) {
        const snCurr = this.getSymmetricalPointIndex(grid, currIdx);
        const snNext = this.getSymmetricalPointIndex(grid, edge.next);
        if (edge.next === snNext) continue;
        if (currIdx === snNext && edge.next === snCurr) continue;
      }
      let possible = true;
      for (const otherEdge of adj[currIdx]) {
        const isMandatoryForMain = otherEdge.hexType === 3 /* Hexagon */ || otherEdge.hexType === 4 /* HexagonMain */;
        if (isMandatoryForMain) {
          const isAlreadyOnPath = path.length >= 2 && otherEdge.next === path[path.length - 2];
          const isNextMove = otherEdge.next === edge.next;
          if (!isAlreadyOnPath && !isNextMove) {
            possible = false;
            break;
          }
        }
      }
      if (!possible) continue;
      if (symmetry !== 0 /* None */) {
        const snCurr = this.getSymmetricalPointIndex(grid, currIdx);
        const snNext = this.getSymmetricalPointIndex(grid, edge.next);
        for (const otherEdge of adj[snCurr]) {
          const isMandatoryForSym = otherEdge.hexType === 3 /* Hexagon */ || otherEdge.hexType === 5 /* HexagonSymmetry */;
          if (isMandatoryForSym) {
            const snPrev = path.length >= 2 ? this.getSymmetricalPointIndex(grid, path[path.length - 2]) : -1;
            const isAlreadyOnSymPath = otherEdge.next === snPrev;
            const isSymNextMove = otherEdge.next === snNext;
            if (!isAlreadyOnSymPath && !isSymNextMove) {
              possible = false;
              break;
            }
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
    const nodeCols = grid.cols + 1;
    for (const move of validMoves) {
      let nextHexMask = hexMask;
      const r = Math.floor(move.next / nodeCols);
      const c = move.next % nodeCols;
      const nodeType = grid.nodes[r][c].type;
      if (nodeType === 3 /* Hexagon */ || nodeType === 4 /* HexagonMain */) {
        nextHexMask |= 1n << BigInt(hexIdMap.get(`n${c},${r}`));
      }
      const prevIdx = path[path.length - 1];
      const pr = Math.floor(prevIdx / nodeCols);
      const pc = prevIdx % nodeCols;
      if (pr === r) {
        const ec = Math.min(pc, c);
        if (move.hexType === 3 /* Hexagon */ || move.hexType === 4 /* HexagonMain */) {
          nextHexMask |= 1n << BigInt(hexIdMap.get(`eh${ec},${r}`));
        }
      } else {
        const er = Math.min(pr, r);
        if (move.hexType === 3 /* Hexagon */ || move.hexType === 4 /* HexagonMain */) {
          nextHexMask |= 1n << BigInt(hexIdMap.get(`ev${c},${er}`));
        }
      }
      if (symmetry !== 0 /* None */) {
        const snNext = this.getSymmetricalPointIndex(grid, move.next);
        const snR = Math.floor(snNext / nodeCols);
        const snC = snNext % nodeCols;
        const snNodeType = grid.nodes[snR][snC].type;
        if (snNodeType === 3 /* Hexagon */ || snNodeType === 5 /* HexagonSymmetry */) {
          nextHexMask |= 1n << BigInt(hexIdMap.get(`n${snC},${snR}`));
        }
        const snPrev = this.getSymmetricalPointIndex(grid, prevIdx);
        const spr = Math.floor(snPrev / nodeCols);
        const spc = snPrev % nodeCols;
        if (spr === snR) {
          const ec = Math.min(spc, snC);
          const et = grid.hEdges[snR][ec].type;
          if (et === 3 /* Hexagon */ || et === 5 /* HexagonSymmetry */) {
            nextHexMask |= 1n << BigInt(hexIdMap.get(`eh${ec},${snR}`));
          }
        } else {
          const er = Math.min(spr, snR);
          const et = grid.vEdges[er][snC].type;
          if (et === 3 /* Hexagon */ || et === 5 /* HexagonSymmetry */) {
            nextHexMask |= 1n << BigInt(hexIdMap.get(`ev${snC},${er}`));
          }
        }
      }
      path.push(move.next);
      let nextVisitedMask = visitedMask | 1n << BigInt(move.next);
      if (symmetry !== 0 /* None */) {
        const snNext = this.getSymmetricalPointIndex(grid, move.next);
        nextVisitedMask |= 1n << BigInt(snNext);
      }
      this.exploreSearchSpace(grid, move.next, nextVisitedMask, path, nextHexMask, totalHexagons, adj, endNodes, fingerprints, stats, limit, externalCells, hasCellMarks, hexIdMap);
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
    const hexIdMap = /* @__PURE__ */ new Map();
    let nextHexId = 0;
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const u = r * nodeCols + c;
        if (grid.nodes[r][c].type === 1 /* Start */) startNodes.push(u);
        if (grid.nodes[r][c].type === 2 /* End */) endNodes.push(u);
        if (grid.nodes[r][c].type === 3 /* Hexagon */ || grid.nodes[r][c].type === 4 /* HexagonMain */ || grid.nodes[r][c].type === 5 /* HexagonSymmetry */) {
          hexIdMap.set(`n${c},${r}`, nextHexId++);
        }
        if (c < cols) {
          const v = u + 1;
          const type = grid.hEdges[r][c].type;
          const isHexagon = type === 3 /* Hexagon */ || type === 4 /* HexagonMain */ || type === 5 /* HexagonSymmetry */;
          const isBroken = type === 1 /* Broken */ || type === 2 /* Absent */;
          adj[u].push({ next: v, hexType: type, isBroken });
          adj[v].push({ next: u, hexType: type, isBroken });
          if (isHexagon) hexIdMap.set(`eh${c},${r}`, nextHexId++);
        }
        if (r < rows) {
          const v = u + nodeCols;
          const type = grid.vEdges[r][c].type;
          const isHexagon = type === 3 /* Hexagon */ || type === 4 /* HexagonMain */ || type === 5 /* HexagonSymmetry */;
          const isBroken = type === 1 /* Broken */ || type === 2 /* Absent */;
          adj[u].push({ next: v, hexType: type, isBroken });
          adj[v].push({ next: u, hexType: type, isBroken });
          if (isHexagon) hexIdMap.set(`ev${c},${r}`, nextHexId++);
        }
      }
    }
    const fingerprints = /* @__PURE__ */ new Set();
    const totalHexagons = nextHexId;
    const externalCells = this.getExternalCells(grid);
    let hasCellMarks = false;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid.cells[r][c].type !== 0 /* None */) {
          hasCellMarks = true;
          break;
        }
      }
      if (hasCellMarks) break;
    }
    this.tetrisCache.clear();
    for (const startIdx of startNodes) {
      const nodeCols2 = grid.cols + 1;
      const r = Math.floor(startIdx / nodeCols2);
      const c = startIdx % nodeCols2;
      let startHexMask = 0n;
      const nodeType = grid.nodes[r][c].type;
      if (nodeType === 3 /* Hexagon */ || nodeType === 4 /* HexagonMain */) {
        startHexMask |= 1n << BigInt(hexIdMap.get(`n${c},${r}`));
      }
      const symmetry = grid.symmetry || 0 /* None */;
      if (symmetry !== 0 /* None */) {
        const snStart = this.getSymmetricalPointIndex(grid, startIdx);
        const snR = Math.floor(snStart / nodeCols2);
        const snC = snStart % nodeCols2;
        const snNodeType = grid.nodes[snR][snC].type;
        if (snNodeType === 3 /* Hexagon */ || snNodeType === 5 /* HexagonSymmetry */) {
          startHexMask |= 1n << BigInt(hexIdMap.get(`n${snC},${snR}`));
        }
      }
      let visitedMask = 1n << BigInt(startIdx);
      if (symmetry !== 0 /* None */) {
        const snStart = this.getSymmetricalPointIndex(grid, startIdx);
        if (snStart === startIdx) continue;
        visitedMask |= 1n << BigInt(snStart);
      }
      this.findPathsOptimized(grid, startIdx, visitedMask, [startIdx], startHexMask, totalHexagons, adj, endNodes, fingerprints, limit, externalCells, hasCellMarks, hexIdMap);
    }
    return fingerprints.size;
  }
  findPathsOptimized(grid, currIdx, visitedMask, path, hexMask, totalHexagons, adj, endNodes, fingerprints, limit, externalCells, hasCellMarks = true, hexIdMap) {
    if (fingerprints.size >= limit) return;
    const symmetry = grid.symmetry || 0 /* None */;
    if (endNodes.includes(currIdx)) {
      let setBits = 0;
      let temp = hexMask;
      while (temp > 0n) {
        if (temp & 1n) setBits++;
        temp >>= 1n;
      }
      if (setBits === totalHexagons) {
        const points = path.map((idx) => ({ x: idx % (grid.cols + 1), y: Math.floor(idx / (grid.cols + 1)) }));
        if (symmetry !== 0 /* None */) {
          const snEnd = this.getSymmetricalPointIndex(grid, currIdx);
          const nodeCols = grid.cols + 1;
          if (grid.nodes[Math.floor(snEnd / nodeCols)][snEnd % nodeCols].type !== 2 /* End */) return;
        }
        const symPathPoints = symmetry !== 0 /* None */ ? points.map((p) => this.getSymmetricalPoint(grid, p)) : [];
        if (!hasCellMarks) {
          fingerprints.add(this.getFingerprint(grid, points, symPathPoints, void 0, externalCells));
        } else {
          const result = this.validateFast(grid, points, symPathPoints, externalCells);
          if (result.isValid) {
            fingerprints.add(this.getFingerprint(grid, points, symPathPoints, result.regions, externalCells));
          }
        }
      }
      return;
    }
    if (!this.canReachEndOptimized(currIdx, visitedMask, adj, endNodes)) return;
    for (const edge of adj[currIdx]) {
      if (edge.isBroken) continue;
      if (visitedMask & 1n << BigInt(edge.next)) continue;
      if (symmetry !== 0 /* None */) {
        const snCurr = this.getSymmetricalPointIndex(grid, currIdx);
        const snNext = this.getSymmetricalPointIndex(grid, edge.next);
        if (edge.next === snNext) continue;
        if (currIdx === snNext && edge.next === snCurr) continue;
      }
      let possible = true;
      for (const otherEdge of adj[currIdx]) {
        const isMandatoryForMain = otherEdge.hexType === 3 /* Hexagon */ || otherEdge.hexType === 4 /* HexagonMain */;
        if (isMandatoryForMain) {
          const isAlreadyOnPath = path.length >= 2 && otherEdge.next === path[path.length - 2];
          const isNextMove = otherEdge.next === edge.next;
          if (!isAlreadyOnPath && !isNextMove) {
            possible = false;
            break;
          }
        }
      }
      if (!possible) continue;
      if (symmetry !== 0 /* None */) {
        const snCurr = this.getSymmetricalPointIndex(grid, currIdx);
        const snNext = this.getSymmetricalPointIndex(grid, edge.next);
        for (const otherEdge of adj[snCurr]) {
          const isMandatoryForSym = otherEdge.hexType === 3 /* Hexagon */ || otherEdge.hexType === 5 /* HexagonSymmetry */;
          if (isMandatoryForSym) {
            const snPrev = path.length >= 2 ? this.getSymmetricalPointIndex(grid, path[path.length - 2]) : -1;
            const isAlreadyOnSymPath = otherEdge.next === snPrev;
            const isSymNextMove = otherEdge.next === snNext;
            if (!isAlreadyOnSymPath && !isSymNextMove) {
              possible = false;
              break;
            }
          }
        }
      }
      if (!possible) continue;
      const nodeCols = grid.cols + 1;
      let nextHexMask = hexMask;
      const r = Math.floor(edge.next / nodeCols);
      const c = edge.next % nodeCols;
      const nodeType = grid.nodes[r][c].type;
      if (nodeType === 3 /* Hexagon */ || nodeType === 4 /* HexagonMain */) {
        nextHexMask |= 1n << BigInt(hexIdMap.get(`n${c},${r}`));
      }
      const pr = Math.floor(currIdx / nodeCols);
      const pc = currIdx % nodeCols;
      if (pr === r) {
        const ec = Math.min(pc, c);
        if (edge.hexType === 3 /* Hexagon */ || edge.hexType === 4 /* HexagonMain */) {
          nextHexMask |= 1n << BigInt(hexIdMap.get(`eh${ec},${r}`));
        }
      } else {
        const er = Math.min(pr, r);
        if (edge.hexType === 3 /* Hexagon */ || edge.hexType === 4 /* HexagonMain */) {
          nextHexMask |= 1n << BigInt(hexIdMap.get(`ev${c},${er}`));
        }
      }
      if (symmetry !== 0 /* None */) {
        const snNext = this.getSymmetricalPointIndex(grid, edge.next);
        const snR = Math.floor(snNext / nodeCols);
        const snC = snNext % nodeCols;
        const snNodeType = grid.nodes[snR][snC].type;
        if (snNodeType === 3 /* Hexagon */ || snNodeType === 5 /* HexagonSymmetry */) {
          nextHexMask |= 1n << BigInt(hexIdMap.get(`n${snC},${snR}`));
        }
        const snCurr = this.getSymmetricalPointIndex(grid, currIdx);
        const spr = Math.floor(snCurr / nodeCols);
        const spc = snCurr % nodeCols;
        if (spr === snR) {
          const ec = Math.min(spc, snC);
          const et = grid.hEdges[snR][ec].type;
          if (et === 3 /* Hexagon */ || et === 5 /* HexagonSymmetry */) {
            nextHexMask |= 1n << BigInt(hexIdMap.get(`eh${ec},${snR}`));
          }
        } else {
          const er = Math.min(spr, snR);
          const et = grid.vEdges[er][snC].type;
          if (et === 3 /* Hexagon */ || et === 5 /* HexagonSymmetry */) {
            nextHexMask |= 1n << BigInt(hexIdMap.get(`ev${snC},${er}`));
          }
        }
      }
      path.push(edge.next);
      let nextVisitedMask = visitedMask | 1n << BigInt(edge.next);
      if (symmetry !== 0 /* None */) {
        const snNext = this.getSymmetricalPointIndex(grid, edge.next);
        nextVisitedMask |= 1n << BigInt(snNext);
      }
      this.findPathsOptimized(grid, edge.next, nextVisitedMask, path, nextHexMask, totalHexagons, adj, endNodes, fingerprints, limit, externalCells, hasCellMarks, hexIdMap);
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
  getFingerprint(grid, path, symPath, precalculatedRegions, externalCells) {
    const regions = precalculatedRegions || this.calculateRegions(grid, path, symPath, externalCells);
    const regionFingerprints = regions.map((region) => {
      let regionStr = "";
      const marks = [];
      for (const p of region) {
        const c = grid.cells[p.y][p.x];
        if (c.type !== 0 /* None */) {
          marks.push(c.type << 8 | c.color);
        }
      }
      marks.sort((a, b) => a - b);
      for (const m of marks) regionStr += m.toString(36) + ",";
      return regionStr;
    }).sort();
    let finalFp = "";
    for (const rf of regionFingerprints) {
      if (rf.length > 0) finalFp += rf + "|";
    }
    return finalFp || "empty";
  }
};

// src/generator.ts
var PuzzleGenerator = class {
  isWorker;
  constructor() {
    this.isWorker = typeof self !== "undefined" && "postMessage" in self && !("document" in self);
  }
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
    const maxAttempts = this.isWorker ? rows * cols > 30 ? 150 : 120 : rows * cols > 30 ? 100 : 80;
    const markAttemptsPerPath = this.isWorker ? 8 : 5;
    const symmetry = options.symmetry || 0 /* None */;
    let startPoint = { x: 0, y: rows };
    let endPoint = { x: cols, y: 0 };
    if (symmetry === 1 /* Horizontal */) {
      endPoint = { x: 0, y: 0 };
    } else if (symmetry === 2 /* Vertical */) {
      endPoint = { x: cols, y: rows };
    } else if (symmetry === 3 /* Rotational */) {
      endPoint = { x: cols, y: rows };
    }
    let currentPath = null;
    let precalculatedRegions = null;
    let precalculatedBoundaryEdges = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt % markAttemptsPerPath === 0) {
        currentPath = this.generateRandomPath(new Grid(rows, cols), startPoint, endPoint, options.pathLength, symmetry);
        const tempGrid = new Grid(rows, cols);
        const symPath = symmetry !== 0 /* None */ ? currentPath.map((p) => this.getSymmetricalPoint(tempGrid, p, symmetry)) : [];
        precalculatedRegions = this.calculateRegions(tempGrid, currentPath, symPath);
        precalculatedBoundaryEdges = precalculatedRegions.map((region) => this.getRegionBoundaryEdges(tempGrid, region, currentPath, symPath));
      }
      const grid = this.generateFromPath(rows, cols, currentPath, options, precalculatedRegions, precalculatedBoundaryEdges);
      if (!this.checkAllRequestedConstraintsPresent(grid, options)) continue;
      const difficulty = validator.calculateDifficulty(grid);
      if (difficulty === 0) continue;
      const diffFromTarget = Math.abs(difficulty - targetDifficulty);
      if (bestGrid === null || diffFromTarget < Math.abs(bestScore - targetDifficulty)) {
        bestScore = difficulty;
        bestGrid = grid;
      }
      if (targetDifficulty > 0.8 && difficulty > 0.8) break;
      if (diffFromTarget < 0.01) break;
    }
    if (!bestGrid) {
      const path = this.generateRandomPath(new Grid(rows, cols), startPoint, endPoint, options.pathLength, symmetry);
      return this.generateFromPath(rows, cols, path, options);
    }
    return bestGrid;
  }
  /**
   * 指定されたパスに基づいてパズルを構築する
   * @param rows 行数
   * @param cols 列数
   * @param solutionPath 解答パス
   * @param options 生成オプション
   * @param precalculatedRegions 事前計算された区画
   * @param precalculatedBoundaryEdges 事前計算された境界エッジ
   * @returns 構築されたグリッド
   */
  generateFromPath(rows, cols, solutionPath, options, precalculatedRegions, precalculatedBoundaryEdges) {
    const grid = new Grid(rows, cols);
    const symmetry = options.symmetry || 0 /* None */;
    grid.symmetry = symmetry;
    let startPoint = { x: 0, y: rows };
    let endPoint = { x: cols, y: 0 };
    if (symmetry === 1 /* Horizontal */) {
      endPoint = { x: 0, y: 0 };
    } else if (symmetry === 2 /* Vertical */) {
      endPoint = { x: cols, y: rows };
    } else if (symmetry === 3 /* Rotational */) {
      endPoint = { x: cols, y: rows };
    }
    grid.nodes[startPoint.y][startPoint.x].type = 1 /* Start */;
    grid.nodes[endPoint.y][endPoint.x].type = 2 /* End */;
    if (symmetry !== 0 /* None */) {
      const symStart = this.getSymmetricalPoint(grid, startPoint, symmetry);
      const symEnd = this.getSymmetricalPoint(grid, endPoint, symmetry);
      grid.nodes[symStart.y][symStart.x].type = 1 /* Start */;
      grid.nodes[symEnd.y][symEnd.x].type = 2 /* End */;
    }
    const symPath = symmetry !== 0 /* None */ ? solutionPath.map((p) => this.getSymmetricalPoint(grid, p, symmetry)) : [];
    this.applyConstraintsBasedOnPath(grid, solutionPath, options, symPath, precalculatedRegions, precalculatedBoundaryEdges);
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
  generateRandomPath(grid, start, end, targetLengthFactor, symmetry = 0 /* None */) {
    if (targetLengthFactor === void 0) {
      return this.generateSingleRandomPath(grid, start, end, void 0, symmetry);
    }
    const minLen = grid.rows + grid.cols;
    const maxLen = (grid.rows + 1) * (grid.cols + 1) - 1;
    const targetLen = minLen + targetLengthFactor * (maxLen - minLen);
    let bestPath = [];
    let bestDiff = Infinity;
    const attempts = grid.rows * grid.cols > 30 ? 30 : 50;
    for (let i = 0; i < attempts; i++) {
      const currentPath = this.generateSingleRandomPath(grid, start, end, targetLengthFactor, symmetry);
      if (currentPath.length === 0) continue;
      const currentLen = currentPath.length - 1;
      const diff = Math.abs(currentLen - targetLen);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestPath = currentPath;
      }
      if (bestDiff <= 2) break;
    }
    return bestPath;
  }
  /**
   * 1本のランダムパスを生成する
   * @param grid グリッド
   * @param start 開始点
   * @param end 終了点
   * @param biasFactor 長さのバイアス
   * @param symmetry 対称性
   * @returns 生成されたパス
   */
  generateSingleRandomPath(grid, start, end, biasFactor, symmetry = 0 /* None */) {
    const visited = /* @__PURE__ */ new Set();
    const path = [];
    let nodesVisited = 0;
    const limit = grid.rows * grid.cols * 200;
    const findPath = (current) => {
      nodesVisited++;
      if (nodesVisited > limit) return false;
      visited.add(`${current.x},${current.y}`);
      const snCurrent = this.getSymmetricalPoint(grid, current, symmetry);
      visited.add(`${snCurrent.x},${snCurrent.y}`);
      path.push(current);
      if (current.x === end.x && current.y === end.y) return true;
      let neighbors = this.getValidNeighbors(grid, current, visited);
      if (symmetry !== 0 /* None */) {
        neighbors = neighbors.filter((n) => {
          const sn = this.getSymmetricalPoint(grid, n, symmetry);
          if (sn.x < 0 || sn.x > grid.cols || sn.y < 0 || sn.y > grid.rows) return false;
          if (visited.has(`${sn.x},${sn.y}`)) return false;
          if (n.x === sn.x && n.y === sn.y) return false;
          const edgeKey = this.getEdgeKey(current, n);
          const symEdgeKey = this.getEdgeKey(snCurrent, sn);
          if (edgeKey === symEdgeKey) return false;
          return true;
        });
      }
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
      visited.delete(`${current.x},${current.y}`);
      visited.delete(`${snCurrent.x},${snCurrent.y}`);
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
   * @param grid グリッド
   * @param path 解答パス
   * @param options 生成オプション
   */
  applyBrokenEdges(grid, path, options) {
    const complexity = options.complexity ?? 0.5;
    const symmetry = options.symmetry ?? 0 /* None */;
    const pathEdges = /* @__PURE__ */ new Set();
    for (let i = 0; i < path.length - 1; i++) {
      pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
      if (symmetry !== 0 /* None */) {
        const p1 = this.getSymmetricalPoint(grid, path[i], symmetry);
        const p2 = this.getSymmetricalPoint(grid, path[i + 1], symmetry);
        pathEdges.add(this.getEdgeKey(p1, p2));
      }
    }
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
      if (edge.type === "h") grid.hEdges[edge.r][edge.c].type = 1 /* Broken */;
      else grid.vEdges[edge.r][edge.c].type = 1 /* Broken */;
      placed++;
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r <= grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          if (grid.hEdges[r][c].type === 1 /* Broken */) {
            if (this.canBecomeAbsent(grid, { type: "h", r, c })) {
              grid.hEdges[r][c].type = 2 /* Absent */;
              changed = true;
            }
          }
        }
      }
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c <= grid.cols; c++) {
          if (grid.vEdges[r][c].type === 1 /* Broken */) {
            if (this.canBecomeAbsent(grid, { type: "v", r, c })) {
              grid.vEdges[r][c].type = 2 /* Absent */;
              changed = true;
            }
          }
        }
      }
    }
    for (let r = 0; r <= grid.rows; r++) {
      for (let c = 0; c <= grid.cols; c++) {
        const edgesWithMeta = [];
        if (c > 0) edgesWithMeta.push({ e: grid.hEdges[r][c - 1], type: "h", r, c: c - 1 });
        if (c < grid.cols) edgesWithMeta.push({ e: grid.hEdges[r][c], type: "h", r, c });
        if (r > 0) edgesWithMeta.push({ e: grid.vEdges[r - 1][c], type: "v", r: r - 1, c });
        if (r < grid.rows) edgesWithMeta.push({ e: grid.vEdges[r][c], type: "v", r, c });
        if (edgesWithMeta.length > 0 && edgesWithMeta.every((m) => m.e.type === 1 /* Broken */ || m.e.type === 2 /* Absent */)) {
          if (edgesWithMeta.every((m) => !this.isAdjacentToMark(grid, m))) {
            for (const m of edgesWithMeta) m.e.type = 2 /* Absent */;
          }
        }
      }
    }
  }
  /**
   * エッジがAbsentに変換可能か判定する
   * @param grid グリッド
   * @param edge 判定対象のエッジ
   * @returns 変換可能かどうか
   */
  canBecomeAbsent(grid, edge) {
    if (this.isAdjacentToMark(grid, edge)) return false;
    if (edge.type === "h") {
      if (edge.r === 0 || edge.r === grid.rows) return true;
    } else {
      if (edge.c === 0 || edge.c === grid.cols) return true;
    }
    const nodes = edge.type === "h" ? [
      { x: edge.c, y: edge.r },
      { x: edge.c + 1, y: edge.r }
    ] : [
      { x: edge.c, y: edge.r },
      { x: edge.c, y: edge.r + 1 }
    ];
    for (const node of nodes) {
      const adjEdges = [
        { type: "h", r: node.y, c: node.x - 1 },
        { type: "h", r: node.y, c: node.x },
        { type: "v", r: node.y - 1, c: node.x },
        { type: "v", r: node.y, c: node.x }
      ];
      for (const adj of adjEdges) {
        if (adj.c >= 0 && adj.c <= grid.cols && adj.r >= 0 && adj.r <= grid.rows) {
          if (adj.type === "h" && adj.c < grid.cols) {
            if (grid.hEdges[adj.r][adj.c].type === 2 /* Absent */) return true;
          } else if (adj.type === "v" && adj.r < grid.rows) {
            if (grid.vEdges[adj.r][adj.c].type === 2 /* Absent */) return true;
          }
        }
      }
    }
    return false;
  }
  /**
   * 到達不可能なエリアをAbsent化し、外部に漏れたセルをクリアする
   * @param grid グリッド
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
   * @param grid グリッド
   * @returns 孤立したマークがあるかどうか
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
  getSymmetricalPoint(grid, p, symmetry) {
    if (symmetry === 1 /* Horizontal */) {
      return { x: grid.cols - p.x, y: p.y };
    } else if (symmetry === 2 /* Vertical */) {
      return { x: p.x, y: grid.rows - p.y };
    } else if (symmetry === 3 /* Rotational */) {
      return { x: grid.cols - p.x, y: grid.rows - p.y };
    }
    return { ...p };
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
   * @param grid グリッド
   * @param path 解答パス
   * @param options 生成オプション
   * @param symPath 対称パス
   * @param precalculatedRegions 事前計算された区画
   * @param precalculatedBoundaryEdges 事前計算された境界エッジ
   */
  applyConstraintsBasedOnPath(grid, path, options, symPath = [], precalculatedRegions, precalculatedBoundaryEdges) {
    const complexity = options.complexity ?? 0.5;
    const useHexagons = options.useHexagons ?? true;
    const useSquares = options.useSquares ?? true;
    const useStars = options.useStars ?? true;
    const useTetris = options.useTetris ?? false;
    const useTetrisNegative = options.useTetrisNegative ?? false;
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
      const symmetry = options.symmetry || 0 /* None */;
      for (let i = 0; i < path.length - 1; i++) {
        const neighbors = this.getValidNeighbors(grid, path[i], /* @__PURE__ */ new Set());
        const isBranching = neighbors.length > 2;
        let prob = complexity * (targetDifficulty < 0.4 ? 0.6 : 0.3);
        if (isBranching) prob = targetDifficulty < 0.4 ? prob * 1 : prob * 0.5;
        if (Math.random() < prob) {
          let type = 3 /* Hexagon */;
          let p1 = path[i];
          let p2 = path[i + 1];
          if (symmetry !== 0 /* None */) {
            const r = Math.random();
            if (r < 0.3) type = 4 /* HexagonMain */;
            else if (r < 0.6) {
              type = 5 /* HexagonSymmetry */;
              p1 = this.getSymmetricalPoint(grid, path[i], symmetry);
              p2 = this.getSymmetricalPoint(grid, path[i + 1], symmetry);
            }
          }
          this.setEdgeHexagon(grid, p1, p2, type);
          hexagonsPlaced++;
        }
      }
      for (let i = 0; i < path.length; i++) {
        const node = path[i];
        if (grid.nodes[node.y][node.x].type !== 0 /* Normal */) continue;
        if (this.hasIncidentHexagonEdge(grid, node)) continue;
        let prob = complexity * (targetDifficulty > 0.6 ? 0.15 : 0.05);
        if (Math.random() < prob) {
          let type = 3 /* Hexagon */;
          let targetNode = node;
          if (symmetry !== 0 /* None */) {
            const r = Math.random();
            if (r < 0.3) type = 4 /* HexagonMain */;
            else if (r < 0.6) {
              type = 5 /* HexagonSymmetry */;
              targetNode = this.getSymmetricalPoint(grid, node, symmetry);
            }
          }
          grid.nodes[targetNode.y][targetNode.x].type = type;
          hexagonsPlaced++;
        }
      }
      if (hexagonsPlaced === 0 && path.length >= 2) {
        const idx = Math.floor(Math.random() * (path.length - 1));
        const symmetry2 = options.symmetry || 0 /* None */;
        let type = 3 /* Hexagon */;
        let p1 = path[idx];
        let p2 = path[idx + 1];
        if (symmetry2 !== 0 /* None */) {
          const r = Math.random();
          if (r < 0.3) type = 4 /* HexagonMain */;
          else if (r < 0.6) {
            type = 5 /* HexagonSymmetry */;
            p1 = this.getSymmetricalPoint(grid, path[idx], symmetry2);
            p2 = this.getSymmetricalPoint(grid, path[idx + 1], symmetry2);
          }
        }
        this.setEdgeHexagon(grid, p1, p2, type);
      }
    }
    if (useSquares || useStars || useTetris || useEraser) {
      const regions = precalculatedRegions || this.calculateRegions(grid, path, symPath);
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
        const intendedColors = /* @__PURE__ */ new Set();
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
            intendedColors.add(squareColor);
          }
        }
        if ((useTetris || useTetrisNegative) && totalTetrisArea < maxTotalTetrisArea) {
          let shouldPlaceTetris = Math.random() < 0.1 + complexity * 0.4;
          if (tetrisPlaced === 0 && remainingRegions <= 2) shouldPlaceTetris = true;
          const maxTetrisPerRegion = tetrisPlaced === 0 && remainingRegions <= 2 ? 6 : 4;
          if (shouldPlaceTetris && potentialCells.length > 0 && totalTetrisArea + region.length <= maxTotalTetrisArea) {
            let tiledPieces = this.generateTiling(region, maxTetrisPerRegion, options);
            if (tiledPieces) {
              const negativePiecesToPlace = [];
              if (useTetrisNegative && Math.random() < 0.2 + complexity * 0.3) {
                const difficulty = options.difficulty ?? 0.5;
                const prob0 = 0.1;
                if (Math.random() < prob0 && potentialCells.length >= 2) {
                  let complexFound = false;
                  if (potentialCells.length >= 3 && Math.random() < 0.8) {
                    const is2pos1neg = Math.random() < 0.5;
                    const baseArea = 1 + Math.floor(Math.random() * 2);
                    const baseShapes = this.TETRIS_SHAPES.filter((s) => this.getShapeArea(s) === baseArea);
                    const base = baseShapes[Math.floor(Math.random() * baseShapes.length)];
                    const triple = this.findStandardTriple(base);
                    if (triple) {
                      if (is2pos1neg) {
                        tiledPieces.push({ shape: base, displayShape: base, isRotated: !this.isRotationallyInvariant(base) && Math.random() < difficulty * 0.7, isNegative: false });
                        tiledPieces.push({ shape: triple.n, displayShape: triple.n, isRotated: !this.isRotationallyInvariant(triple.n) && Math.random() < difficulty * 0.7, isNegative: false });
                        negativePiecesToPlace.push({ shape: triple.p, displayShape: triple.p, isRotated: !this.isRotationallyInvariant(triple.p) && Math.random() < difficulty * 0.7, isNegative: true });
                      } else {
                        tiledPieces.push({ shape: triple.p, displayShape: triple.p, isRotated: !this.isRotationallyInvariant(triple.p) && Math.random() < difficulty * 0.7, isNegative: false });
                        negativePiecesToPlace.push({ shape: base, displayShape: base, isRotated: !this.isRotationallyInvariant(base) && Math.random() < difficulty * 0.7, isNegative: true });
                        negativePiecesToPlace.push({ shape: triple.n, displayShape: triple.n, isRotated: !this.isRotationallyInvariant(triple.n) && Math.random() < difficulty * 0.7, isNegative: true });
                      }
                      complexFound = true;
                    }
                  }
                  if (!complexFound) {
                    const area = 3 + Math.floor(Math.random() * 2);
                    const candidates = this.TETRIS_SHAPES.filter((s) => this.getShapeArea(s) === area);
                    this.shuffleArray(candidates);
                    if (candidates.length > 0) {
                      const pShape = candidates[0];
                      const nShape = candidates[0];
                      tiledPieces.push({ shape: pShape, displayShape: pShape, isRotated: !this.isRotationallyInvariant(pShape) && Math.random() < difficulty * 0.7, isNegative: false });
                      negativePiecesToPlace.push({ shape: nShape, displayShape: nShape, isRotated: !this.isRotationallyInvariant(nShape) && Math.random() < difficulty * 0.7, isNegative: true });
                    }
                  }
                } else if (tiledPieces.length > 0) {
                  const numSubtractions = Math.random() < 0.3 ? 2 : 1;
                  for (let i = 0; i < numSubtractions; i++) {
                    if (potentialCells.length < 1) break;
                    const targetIdx = Math.floor(Math.random() * tiledPieces.length);
                    const original = tiledPieces[targetIdx];
                    if (original.isNegative) continue;
                    let complexSubtraction = false;
                    if (potentialCells.length >= 2 && Math.random() < 0.2) {
                      const triple1 = this.findStandardTriple(original.shape);
                      if (triple1) {
                        const triple2 = this.findStandardTriple(triple1.p);
                        if (triple2) {
                          tiledPieces[targetIdx] = { shape: triple2.p, displayShape: triple2.p, isRotated: !this.isRotationallyInvariant(triple2.p) && Math.random() < difficulty * 0.7, isNegative: false };
                          negativePiecesToPlace.push({ shape: triple1.n, displayShape: triple1.n, isRotated: !this.isRotationallyInvariant(triple1.n) && Math.random() < difficulty * 0.7, isNegative: true });
                          negativePiecesToPlace.push({ shape: triple2.n, displayShape: triple2.n, isRotated: !this.isRotationallyInvariant(triple2.n) && Math.random() < difficulty * 0.7, isNegative: true });
                          complexSubtraction = true;
                        }
                      }
                    }
                    if (!complexSubtraction) {
                      const triple = this.findStandardTriple(original.shape);
                      if (triple) {
                        const isDuplicate = tiledPieces.some((tp) => !tp.isNegative && this.isSameShape(tp.shape, triple.n));
                        if (!isDuplicate) {
                          tiledPieces[targetIdx] = {
                            shape: triple.p,
                            displayShape: triple.p,
                            isRotated: !this.isRotationallyInvariant(triple.p) && Math.random() < difficulty * 0.7,
                            isNegative: false
                          };
                          negativePiecesToPlace.push({
                            shape: triple.n,
                            displayShape: triple.n,
                            isRotated: !this.isRotationallyInvariant(triple.n) && Math.random() < difficulty * 0.7,
                            isNegative: true
                          });
                        }
                      }
                    }
                  }
                }
              }
              const allPieces = [...tiledPieces, ...negativePiecesToPlace];
              for (const p of allPieces) {
                if (potentialCells.length === 0) break;
                const cell = potentialCells.pop();
                const isNeg = p.isNegative;
                if (isNeg) {
                  grid.cells[cell.y][cell.x].type = p.isRotated ? 7 /* TetrisNegativeRotated */ : 6 /* TetrisNegative */;
                  grid.cells[cell.y][cell.x].color = getDefColor(6 /* TetrisNegative */, Color.Cyan);
                } else {
                  grid.cells[cell.y][cell.x].type = p.isRotated ? 4 /* TetrisRotated */ : 3 /* Tetris */;
                  const defColor = getDefColor(3 /* Tetris */, Color.None);
                  let tetrisColor = defColor;
                  if (useStars && Math.random() < 0.3) {
                    const candidates = availableColors.filter((c) => c !== defColor && !intendedColors.has(c));
                    if (candidates.length > 0) {
                      tetrisColor = candidates[Math.floor(Math.random() * candidates.length)];
                      intendedColors.add(tetrisColor);
                    }
                  }
                  grid.cells[cell.y][cell.x].color = tetrisColor;
                }
                grid.cells[cell.y][cell.x].shape = p.isRotated ? p.displayShape : p.shape;
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
              boundaryEdges = precalculatedBoundaryEdges ? precalculatedBoundaryEdges[idx] : this.getRegionBoundaryEdges(grid, region, path, symPath);
              if (boundaryEdges.length > 0) errorTypes.push("hexagon");
            }
            if (useTetris) errorTypes.push("tetris");
            let errorType = errorTypes.length > 0 ? errorTypes[Math.floor(Math.random() * errorTypes.length)] : null;
            if (potentialCells.length >= 2 && (!errorType || Math.random() < 0.01)) errorType = "eraser";
            let errorPlaced = false;
            if (errorType === "hexagon") {
              const validEdges = boundaryEdges.filter((e) => !this.isEdgeAdjacentToHexagonNode(grid, e));
              if (validEdges.length > 0) {
                const edge = validEdges[Math.floor(Math.random() * validEdges.length)];
                if (edge.type === "h") grid.hEdges[edge.r][edge.c].type = 3 /* Hexagon */;
                else grid.vEdges[edge.r][edge.c].type = 3 /* Hexagon */;
                hexagonsPlaced++;
                errorPlaced = true;
              }
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
                    tetrisColor = availableColors[Math.floor(Math.random() * availableColors.length)];
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
              const defColor = getDefColor(5 /* Eraser */, Color.White);
              let eraserColor = defColor;
              if (useStars && Math.random() < 0.3) {
                const candidates = availableColors.filter((c) => c !== defColor && !intendedColors.has(c));
                if (candidates.length > 0) {
                  eraserColor = candidates[Math.floor(Math.random() * candidates.length)];
                  intendedColors.add(eraserColor);
                }
              }
              grid.cells[cell.y][cell.x].color = eraserColor;
              erasersPlaced++;
            }
          }
        }
        if (useStars) {
          for (const color of availableColors) {
            if (potentialCells.length < 1) break;
            const colorCount = region.filter((p) => grid.cells[p.y][p.x].color === color).length;
            if (colorCount === 1 && (color !== Color.White || intendedColors.has(color))) {
              const cell = potentialCells.pop();
              grid.cells[cell.y][cell.x].type = 2 /* Star */;
              grid.cells[cell.y][cell.x].color = color;
              starsPlaced++;
            }
          }
          const maxPairs = Math.max(1, Math.floor(region.length / 8));
          for (let p = 0; p < maxPairs; p++) {
            if (potentialCells.length < 2) break;
            for (const color of availableColors) {
              if (potentialCells.length < 2) break;
              if (Math.random() > 0.3 + complexity * 0.4) continue;
              const colorCount = region.filter((p2) => grid.cells[p2.y][p2.x].color === color).length;
              if (colorCount === 0) {
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
   * @param grid グリッド
   * @param path 解答パス
   * @param symPath 対称パス
   * @returns 区画リスト
   */
  calculateRegions(grid, path, symPath = []) {
    const regions = [];
    const rows = grid.rows;
    const cols = grid.cols;
    const visitedCells = new Uint8Array(rows * cols);
    const hEdgesMask = new Uint8Array((rows + 1) * cols);
    const vEdgesMask = new Uint8Array(rows * (cols + 1));
    const setEdge = (p1, p2) => {
      if (p1.x === p2.x) {
        vEdgesMask[Math.min(p1.y, p2.y) * (cols + 1) + p1.x] = 1;
      } else {
        hEdgesMask[p1.y * cols + Math.min(p1.x, p2.x)] = 1;
      }
    };
    for (let i = 0; i < path.length - 1; i++) setEdge(path[i], path[i + 1]);
    for (let i = 0; i < symPath.length - 1; i++) setEdge(symPath[i], symPath[i + 1]);
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid.hEdges[r][c].type === 2 /* Absent */) hEdgesMask[r * cols + c] = 1;
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c <= cols; c++) {
        if (grid.vEdges[r][c].type === 2 /* Absent */) vEdgesMask[r * (cols + 1) + c] = 1;
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (visitedCells[idx]) continue;
        const region = [];
        const queue = [idx];
        visitedCells[idx] = 1;
        let head = 0;
        while (head < queue.length) {
          const currIdx = queue[head++];
          const cx = currIdx % cols;
          const cy = Math.floor(currIdx / cols);
          region.push({ x: cx, y: cy });
          if (cy > 0 && !hEdgesMask[cy * cols + cx]) {
            const nIdx = (cy - 1) * cols + cx;
            if (!visitedCells[nIdx]) {
              visitedCells[nIdx] = 1;
              queue.push(nIdx);
            }
          }
          if (cy < rows - 1 && !hEdgesMask[(cy + 1) * cols + cx]) {
            const nIdx = (cy + 1) * cols + cx;
            if (!visitedCells[nIdx]) {
              visitedCells[nIdx] = 1;
              queue.push(nIdx);
            }
          }
          if (cx > 0 && !vEdgesMask[cy * (cols + 1) + cx]) {
            const nIdx = cy * cols + (cx - 1);
            if (!visitedCells[nIdx]) {
              visitedCells[nIdx] = 1;
              queue.push(nIdx);
            }
          }
          if (cx < cols - 1 && !vEdgesMask[cy * (cols + 1) + (cx + 1)]) {
            const nIdx = cy * cols + (cx + 1);
            if (!visitedCells[nIdx]) {
              visitedCells[nIdx] = 1;
              queue.push(nIdx);
            }
          }
        }
        regions.push(region);
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
   * @param grid グリッド
   * @param region 区画
   * @param path 解答パス
   * @param symPath 対称パス
   * @returns 境界エッジのリスト
   */
  getRegionBoundaryEdges(grid, region, path, symPath = []) {
    const pathEdges = /* @__PURE__ */ new Set();
    for (let i = 0; i < path.length - 1; i++) pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
    for (let i = 0; i < symPath.length - 1; i++) pathEdges.add(this.getEdgeKey(symPath[i], symPath[i + 1]));
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
  setEdgeHexagon(grid, p1, p2, type = 3 /* Hexagon */) {
    if (p1.x === p2.x) grid.vEdges[Math.min(p1.y, p2.y)][p1.x].type = type;
    else grid.hEdges[p1.y][Math.min(p1.x, p2.x)].type = type;
  }
  hasIncidentHexagonEdge(grid, p) {
    const isHex = (t) => t === 3 /* Hexagon */ || t === 4 /* HexagonMain */ || t === 5 /* HexagonSymmetry */;
    if (p.x > 0 && isHex(grid.hEdges[p.y][p.x - 1].type)) return true;
    if (p.x < grid.cols && isHex(grid.hEdges[p.y][p.x].type)) return true;
    if (p.y > 0 && isHex(grid.vEdges[p.y - 1][p.x].type)) return true;
    if (p.y < grid.rows && isHex(grid.vEdges[p.y][p.x].type)) return true;
    return false;
  }
  isEdgeAdjacentToHexagonNode(grid, edge) {
    const isHex = (t) => t === 3 /* Hexagon */ || t === 4 /* HexagonMain */ || t === 5 /* HexagonSymmetry */;
    if (edge.type === "h") {
      return isHex(grid.nodes[edge.r][edge.c].type) || isHex(grid.nodes[edge.r][edge.c + 1].type);
    } else {
      return isHex(grid.nodes[edge.r][edge.c].type) || isHex(grid.nodes[edge.r + 1][edge.c].type);
    }
  }
  /**
   * 要求された制約が全て含まれているか確認する
   * @param grid グリッド
   * @param options 生成オプション
   * @returns 全ての要求された制約が含まれているか
   */
  checkAllRequestedConstraintsPresent(grid, options) {
    const useHexagons = options.useHexagons ?? true;
    const useSquares = options.useSquares ?? true;
    const useStars = options.useStars ?? true;
    const useTetris = options.useTetris ?? false;
    const useTetrisNegative = options.useTetrisNegative ?? false;
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
      const isHexEdge = (t) => t === 3 /* Hexagon */ || t === 4 /* HexagonMain */ || t === 5 /* HexagonSymmetry */;
      const isHexNode = (t) => t === 3 /* Hexagon */ || t === 4 /* HexagonMain */ || t === 5 /* HexagonSymmetry */;
      for (let r = 0; r <= grid.rows; r++)
        for (let c = 0; c < grid.cols; c++)
          if (isHexEdge(grid.hEdges[r][c].type)) {
            found = true;
            break;
          }
      if (!found) {
        for (let r = 0; r < grid.rows; r++)
          for (let c = 0; c <= grid.cols; c++)
            if (isHexEdge(grid.vEdges[r][c].type)) {
              found = true;
              break;
            }
      }
      if (!found) {
        for (let r = 0; r <= grid.rows; r++)
          for (let c = 0; c <= grid.cols; c++)
            if (isHexNode(grid.nodes[r][c].type)) {
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
      let fTN = false;
      let fE = false;
      const sqC = /* @__PURE__ */ new Set();
      const stC = /* @__PURE__ */ new Set();
      for (let r = 0; r < grid.rows; r++)
        for (let c = 0; c < grid.cols; c++) {
          const type = grid.cells[r][c].type;
          if (type === 1 /* Square */) {
            fSq = true;
            sqC.add(grid.cells[r][c].color);
          }
          if (type === 2 /* Star */) {
            fSt = true;
            stC.add(grid.cells[r][c].color);
          }
          if (type === 3 /* Tetris */ || type === 4 /* TetrisRotated */) fT = true;
          if (type === 6 /* TetrisNegative */ || type === 7 /* TetrisNegativeRotated */) fTN = true;
          if (type === 5 /* Eraser */) fE = true;
        }
      if (useSquares && !fSq) return false;
      if (useStars && !fSt) return false;
      if (useTetris && !fT) return false;
      if (useTetrisNegative && !fTN) return false;
      if (useEraser && !fE) return false;
      if (useSquares && fSq) {
        if (sqC.size < 2) {
          const onlyColor = sqC.values().next().value;
          if (onlyColor === void 0 || !stC.has(onlyColor)) return false;
        }
      }
    }
    if (this.hasIsolatedMark(grid)) return false;
    return true;
  }
  /**
   * 指定された区画をピースで埋め尽くすタイリングを生成する
   * @param region 区画
   * @param maxPieces 最大ピース数
   * @param options 生成オプション
   * @returns タイリング結果
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
   * @param regionGrid 領域のグリッド表現
   * @param currentPieces 現在配置済みのピース
   * @param maxPieces 最大ピース数
   * @param options 生成オプション
   * @returns 成功した場合はピースのリスト、失敗した場合はnull
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
    return this.getAllRotations(shape).length === 1;
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
  isSameShape(s1, s2) {
    const rotations = this.getAllRotations(s1);
    const s2Str = JSON.stringify(s2);
    return rotations.some((r) => JSON.stringify(r) === s2Str);
  }
  canTilePieceWith(p, t, n) {
    const areaP = this.getShapeArea(p);
    const areaT = this.getShapeArea(t);
    const areaN = this.getShapeArea(n);
    if (areaP !== areaT + areaN) return false;
    const rotationsT = this.getAllRotations(t);
    const rotationsN = this.getAllRotations(n);
    const hP = p.length, wP = p[0].length;
    for (const rt of rotationsT) {
      for (const rn of rotationsN) {
        const hT = rt.length, wT = rt[0].length;
        const hN = rn.length, wN = rn[0].length;
        for (let rT = 0; rT <= hP - hT; rT++) {
          for (let cT = 0; cT <= wP - wT; cT++) {
            for (let rN = 0; rN <= hP - hN; rN++) {
              for (let cN = 0; cN <= wP - wN; cN++) {
                const grid = Array.from({ length: hP }, () => Array(wP).fill(0));
                let possible = true;
                for (let r = 0; r < hT; r++) {
                  for (let c = 0; c < wT; c++) {
                    if (rt[r][c]) grid[rT + r][cT + c] = 1;
                  }
                }
                for (let r = 0; r < hN; r++) {
                  for (let c = 0; c < wN; c++) {
                    if (rn[r][c]) {
                      if (grid[rN + r][cN + c]) {
                        possible = false;
                        break;
                      }
                      grid[rN + r][cN + c] = 1;
                    }
                  }
                  if (!possible) break;
                }
                if (possible) {
                  let matches = true;
                  for (let r = 0; r < hP; r++) {
                    for (let c = 0; c < wP; c++) {
                      if (grid[r][c] !== p[r][c]) {
                        matches = false;
                        break;
                      }
                    }
                    if (!matches) break;
                  }
                  if (matches) return true;
                }
              }
            }
          }
        }
      }
    }
    return false;
  }
  findStandardTriple(t) {
    const areaT = this.getShapeArea(t);
    const nCandidates = [...this.TETRIS_SHAPES];
    this.shuffleArray(nCandidates);
    for (const n of nCandidates) {
      const areaN = this.getShapeArea(n);
      const areaP = areaT + areaN;
      if (areaP > 5) continue;
      const pCandidates = this.TETRIS_SHAPES.filter((s) => this.getShapeArea(s) === areaP);
      for (const p of pCandidates) {
        if (this.canTilePieceWith(p, t, n)) return { p, n };
      }
    }
    return null;
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
  /**
   * パズルデータとオプションを圧縮されたBase64文字列に変換する
   * @param puzzle パズルデータ
   * @param options 生成オプション
   * @returns シリアライズされた文字列
   */
  static async serialize(puzzle, options) {
    const bw = new BitWriter();
    bw.write(puzzle.rows, 6);
    bw.write(puzzle.cols, 6);
    bw.write(puzzle.symmetry ?? 0, 2);
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
    for (let y = 0; y < puzzle.rows; y++) for (let x = 0; x < puzzle.cols + 1; x++) bw.write(puzzle.vEdges[y][x].type, 3);
    for (let y = 0; y < puzzle.rows + 1; y++) for (let x = 0; x < puzzle.cols; x++) bw.write(puzzle.hEdges[y][x].type, 3);
    for (let y = 0; y < puzzle.rows + 1; y++) for (let x = 0; x < puzzle.cols + 1; x++) bw.write(puzzle.nodes[y][x].type, 3);
    bw.write(+!!options.useHexagons, 1);
    bw.write(+!!options.useSquares, 1);
    bw.write(+!!options.useStars, 1);
    bw.write(+!!options.useTetris, 1);
    bw.write(+!!options.useTetrisNegative, 1);
    bw.write(+!!options.useEraser, 1);
    bw.write(+!!options.useBrokenEdges, 1);
    bw.write(options.symmetry ?? 0, 2);
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
  /**
   * シリアライズされた文字列からパズルデータとオプションを復元する
   * @param str シリアライズされた文字列
   * @returns 復元されたパズルデータとオプション
   */
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
    const symmetry = br.read(2);
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
    const vEdges = Array.from({ length: rows }, () => Array.from({ length: cols + 1 }, () => ({ type: br.read(3) })));
    const hEdges = Array.from({ length: rows + 1 }, () => Array.from({ length: cols }, () => ({ type: br.read(3) })));
    const nodes = Array.from({ length: rows + 1 }, () => Array.from({ length: cols + 1 }, () => ({ type: br.read(3) })));
    const readRatio = () => {
      const v = br.read(8);
      return Math.round(v / 254 * 1e3) / 1e3;
    };
    const options = {};
    const useHexagons = !!br.read(1);
    const useSquares = !!br.read(1);
    const useStars = !!br.read(1);
    const useTetris = !!br.read(1);
    const useTetrisNegative = !!br.read(1);
    const useEraser = !!br.read(1);
    const useBroken = !!br.read(1);
    const optSymmetry = br.read(2);
    if (useHexagons) options.useHexagons = true;
    if (useSquares) options.useSquares = true;
    if (useStars) options.useStars = true;
    if (useTetris) options.useTetris = true;
    if (useTetrisNegative) options.useTetrisNegative = true;
    if (useEraser) options.useEraser = true;
    if (useBroken) options.useBrokenEdges = true;
    options.symmetry = optSymmetry;
    const complexity = readRatio();
    const difficulty = readRatio();
    const pathLength = readRatio();
    if (complexity !== 0) options.complexity = complexity;
    if (difficulty !== 0) options.difficulty = difficulty;
    if (pathLength !== 0) options.pathLength = pathLength;
    return { puzzle: { rows, cols, cells, vEdges, hEdges, nodes, symmetry }, options };
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
  invalidatedNodes = [];
  errorCells = [];
  errorEdges = [];
  errorNodes = [];
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
  canvasRect = null;
  // イベントハンドラの参照（解除用）
  boundMouseDown = null;
  boundMouseMove = null;
  boundMouseUp = null;
  boundTouchStart = null;
  boundTouchMove = null;
  boundTouchEnd = null;
  constructor(canvasOrId, puzzle, options = {}) {
    if (typeof canvasOrId === "string") {
      if (typeof document === "undefined") {
        throw new Error("Cannot look up canvas by ID in a non-browser environment.");
      }
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
  /**
   * デフォルトオプションとユーザー指定オプションをマージする
   * @param options 指定されたオプション
   * @returns マージ後の全オプション
   */
  mergeOptions(options) {
    const animations = {
      blinkDuration: options.animations?.blinkDuration ?? this.options?.animations?.blinkDuration ?? 1e3,
      fadeDuration: options.animations?.fadeDuration ?? this.options?.animations?.fadeDuration ?? 1e3,
      blinkPeriod: options.animations?.blinkPeriod ?? this.options?.animations?.blinkPeriod ?? 800
    };
    const colors = {
      path: options.colors?.path ?? this.options?.colors?.path ?? "#ffcc00",
      error: options.colors?.error ?? this.options?.colors?.error ?? "#ff4444",
      success: options.colors?.success ?? this.options?.colors?.success ?? "#ffcc00",
      symmetry: options.colors?.symmetry ?? this.options?.colors?.symmetry ?? "rgba(255, 255, 255, 0.5)",
      interrupted: options.colors?.interrupted ?? this.options?.colors?.interrupted ?? "#ffcc00",
      grid: options.colors?.grid ?? this.options?.colors?.grid ?? "#555",
      node: options.colors?.node ?? this.options?.colors?.node ?? "#555",
      hexagon: options.colors?.hexagon ?? this.options?.colors?.hexagon ?? "#000",
      hexagonMain: options.colors?.hexagonMain ?? this.options?.colors?.hexagonMain ?? "#00ffff",
      hexagonSymmetry: options.colors?.hexagonSymmetry ?? this.options?.colors?.hexagonSymmetry ?? "#ffff00",
      colorMap: options.colors?.colorMap ?? this.options?.colors?.colorMap ?? {
        [Color.Black]: "#000",
        [Color.White]: "#fff",
        [Color.Red]: "#f00",
        [Color.Blue]: "#00f",
        [Color.Cyan]: "#00ffff",
        [Color.None]: "#ffcc00"
      },
      colorList: options.colors?.colorList ?? this.options?.colors?.colorList
    };
    return {
      gridPadding: options.gridPadding ?? this.options?.gridPadding ?? 60,
      cellSize: options.cellSize ?? this.options?.cellSize ?? 80,
      nodeRadius: options.nodeRadius ?? this.options?.nodeRadius ?? 6,
      startNodeRadius: options.startNodeRadius ?? this.options?.startNodeRadius ?? 22,
      pathWidth: options.pathWidth ?? this.options?.pathWidth ?? 18,
      exitLength: options.exitLength ?? this.options?.exitLength ?? 25,
      autoResize: options.autoResize ?? this.options?.autoResize ?? true,
      blinkMarksOnError: options.blinkMarksOnError ?? this.options?.blinkMarksOnError ?? true,
      stayPathOnError: options.stayPathOnError ?? this.options?.stayPathOnError ?? true,
      animations,
      colors,
      onPathComplete: options.onPathComplete ?? this.options?.onPathComplete ?? (() => {
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
    this.invalidatedNodes = [];
    this.errorCells = [];
    this.errorEdges = [];
    this.errorNodes = [];
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
  setValidationResult(isValid, invalidatedCells = [], invalidatedEdges = [], errorCells = [], errorEdges = [], invalidatedNodes = [], errorNodes = []) {
    this.invalidatedCells = invalidatedCells;
    this.invalidatedEdges = invalidatedEdges;
    this.invalidatedNodes = invalidatedNodes;
    this.errorCells = errorCells;
    this.errorEdges = errorEdges;
    this.errorNodes = errorNodes;
    this.eraserAnimationStartTime = Date.now();
    if (isValid) {
      this.isSuccessFading = true;
      this.successFadeStartTime = Date.now();
    } else {
      this.isInvalidPath = true;
    }
  }
  /**
   * パズルのサイズに合わせてCanvasの物理サイズを調整する
   */
  resizeCanvas() {
    if (!this.puzzle || !this.canvas) return;
    this.canvas.width = this.puzzle.cols * this.options.cellSize + this.options.gridPadding * 2;
    this.canvas.height = this.puzzle.rows * this.options.cellSize + this.options.gridPadding * 2;
  }
  /**
   * Canvasの表示上の矩形情報を設定する（Worker時などに必要）
   */
  setCanvasRect(rect) {
    this.canvasRect = rect;
  }
  /**
   * マウス・タッチイベントを初期化する
   */
  initEvents() {
    if (typeof window === "undefined" || !(this.canvas instanceof HTMLCanvasElement)) return;
    this.boundMouseDown = (e) => this.handleStart(e);
    this.boundMouseMove = (e) => this.handleMove(e);
    this.boundMouseUp = (e) => this.handleEnd(e);
    this.boundTouchStart = (e) => {
      if (this.handleStart(e.touches[0])) {
        if (e.cancelable) e.preventDefault();
      }
    };
    this.boundTouchMove = (e) => {
      if (this.isDrawing) {
        if (e.cancelable) e.preventDefault();
        this.handleMove(e.touches[0]);
      }
    };
    this.boundTouchEnd = (e) => {
      if (this.isDrawing) {
        if (e.cancelable) e.preventDefault();
        this.handleEnd(e.changedTouches[0]);
      }
    };
    this.canvas.addEventListener("mousedown", this.boundMouseDown);
    window.addEventListener("mousemove", this.boundMouseMove);
    window.addEventListener("mouseup", this.boundMouseUp);
    this.canvas.addEventListener("touchstart", this.boundTouchStart, { passive: false });
    window.addEventListener("touchmove", this.boundTouchMove, { passive: false });
    window.addEventListener("touchend", this.boundTouchEnd, { passive: false });
  }
  /**
   * イベントリスナーを解除し、リソースを解放する
   */
  destroy() {
    if (typeof window === "undefined" || !(this.canvas instanceof HTMLCanvasElement)) return;
    if (this.boundMouseDown) this.canvas.removeEventListener("mousedown", this.boundMouseDown);
    if (this.boundMouseMove) window.removeEventListener("mousemove", this.boundMouseMove);
    if (this.boundMouseUp) window.removeEventListener("mouseup", this.boundMouseUp);
    if (this.boundTouchStart) this.canvas.removeEventListener("touchstart", this.boundTouchStart);
    if (this.boundTouchMove) window.removeEventListener("touchmove", this.boundTouchMove);
    if (this.boundTouchEnd) window.removeEventListener("touchend", this.boundTouchEnd);
    this.boundMouseDown = null;
    this.boundMouseMove = null;
    this.boundMouseUp = null;
    this.boundTouchStart = null;
    this.boundTouchMove = null;
    this.boundTouchEnd = null;
  }
  // --- 座標変換 ---
  /**
   * グリッド座標をCanvas上のピクセル座標に変換する
   * @param gridX グリッドX
   * @param gridY グリッドY
   * @returns Canvas座標
   */
  getCanvasCoords(gridX, gridY) {
    return {
      x: this.options.gridPadding + gridX * this.options.cellSize,
      y: this.options.gridPadding + gridY * this.options.cellSize
    };
  }
  /**
   * 指定されたノードが出口の場合、その出っ張りの方向ベクトルを返す
   * @param x グリッドX
   * @param y グリッドY
   * @returns 方向ベクトル、またはnull
   */
  getExitDir(x, y) {
    if (!this.puzzle) return null;
    if (this.puzzle.nodes[y]?.[x]?.type !== 2 /* End */) return null;
    if (x === this.puzzle.cols) return { x: 1, y: 0 };
    if (x === 0) return { x: -1, y: 0 };
    if (y === 0) return { x: 0, y: -1 };
    if (y === this.puzzle.rows) return { x: 0, y: 1 };
    return { x: 1, y: 0 };
  }
  // --- イベントハンドラ ---
  handleStart(e) {
    if (!this.puzzle) return false;
    const rect = this.canvasRect || (this.canvas instanceof HTMLCanvasElement ? this.canvas.getBoundingClientRect() : { left: 0, top: 0, width: this.canvas.width, height: this.canvas.height });
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
            this.invalidatedNodes = [];
            this.errorCells = [];
            this.errorEdges = [];
            this.errorNodes = [];
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
    const rect = this.canvasRect || (this.canvas instanceof HTMLCanvasElement ? this.canvas.getBoundingClientRect() : { left: 0, top: 0, width: this.canvas.width, height: this.canvas.height });
    const mouseX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    const lastPoint = this.path[this.path.length - 1];
    const lastPos = this.getCanvasCoords(lastPoint.x, lastPoint.y);
    const dx = mouseX - lastPos.x;
    const dy = mouseY - lastPos.y;
    const symmetry = this.puzzle.symmetry || 0 /* None */;
    const exitDir = this.getExitDir(lastPoint.x, lastPoint.y);
    const intendedDir = Math.abs(dx) > Math.abs(dy) ? { x: dx > 0 ? 1 : -1, y: 0 } : { x: 0, y: dy > 0 ? 1 : -1 };
    if (exitDir && intendedDir.x === exitDir.x && intendedDir.y === exitDir.y) {
      const dot = dx * exitDir.x + dy * exitDir.y;
      const length = Math.max(0, Math.min(dot, this.options.exitLength));
      this.currentMousePos = {
        x: lastPos.x + exitDir.x * length,
        y: lastPos.y + exitDir.y * length
      };
      this.draw();
      return;
    }
    const tryMoveTo = (target, d) => {
      const edgeType = this.getEdgeType(lastPoint, target);
      if (target.x < 0 || target.x > this.puzzle.cols || target.y < 0 || target.y > this.puzzle.rows || edgeType === 2 /* Absent */) {
        this.currentMousePos = lastPos;
        return;
      }
      let maxMove = edgeType === 1 /* Broken */ ? this.options.cellSize * 0.35 : this.options.cellSize;
      const targetEdgeKey = this.getEdgeKey(lastPoint, target);
      const isBacktracking = this.path.length >= 2 && target.x === this.path[this.path.length - 2].x && target.y === this.path[this.path.length - 2].y;
      if (!isBacktracking) {
        for (let i = 0; i < this.path.length - 1; i++) {
          if (this.getEdgeKey(this.path[i], this.path[i + 1]) === targetEdgeKey) {
            maxMove = 0;
            break;
          }
        }
      }
      const isTargetInPath = this.path.some((p) => p.x === target.x && p.y === target.y);
      if (isTargetInPath && this.path.length >= 2) {
        const secondToLast = this.path[this.path.length - 2];
        if (target.x !== secondToLast.x || target.y !== secondToLast.y) {
          maxMove = Math.min(maxMove, this.options.cellSize * 0.5 - this.options.pathWidth * 0.5);
        }
      }
      if (symmetry !== 0 /* None */) {
        const symLast = this.getSymmetricalPoint(lastPoint);
        const symTarget = this.getSymmetricalPoint(target);
        const symEdgeType = this.getEdgeType(symLast, symTarget);
        const symPath2 = this.getSymmetryPath(this.path);
        const symEdgeKey = this.getEdgeKey(symLast, symTarget);
        if (symTarget.x < 0 || symTarget.x > this.puzzle.cols || symTarget.y < 0 || symTarget.y > this.puzzle.rows || symEdgeType === 2 /* Absent */) {
          this.currentMousePos = lastPos;
          return;
        }
        if (symEdgeType === 1 /* Broken */) {
          maxMove = Math.min(maxMove, this.options.cellSize * 0.35);
        }
        const isNodeOccupiedBySym = symPath2.some((p) => p.x === target.x && p.y === target.y);
        const isSymNodeOccupiedByMain = this.path.some((p) => p.x === symTarget.x && p.y === symTarget.y);
        const isMeetingAtNode = target.x === symTarget.x && target.y === symTarget.y;
        const isEdgeOccupiedBySym = symPath2.some((p, i) => i < symPath2.length - 1 && this.getEdgeKey(symPath2[i], symPath2[i + 1]) === targetEdgeKey);
        const isMirrorEdgeOccupiedByMain = this.path.some((p, i) => i < this.path.length - 1 && this.getEdgeKey(this.path[i], this.path[i + 1]) === symEdgeKey);
        const isSelfMirrorEdge = targetEdgeKey === symEdgeKey;
        if (isNodeOccupiedBySym || isSymNodeOccupiedByMain || isMeetingAtNode || isEdgeOccupiedBySym || isMirrorEdgeOccupiedByMain || isSelfMirrorEdge) {
          maxMove = Math.min(maxMove, this.options.cellSize * 0.5 - this.options.pathWidth * 0.5);
        }
      }
      if (target.x !== lastPoint.x) {
        this.currentMousePos = {
          x: lastPos.x + Math.max(-maxMove, Math.min(maxMove, d)),
          y: lastPos.y
        };
      } else {
        this.currentMousePos = {
          x: lastPos.x,
          y: lastPos.y + Math.max(-maxMove, Math.min(maxMove, d))
        };
      }
    };
    if (Math.abs(dx) > Math.abs(dy)) {
      const dir = dx > 0 ? 1 : -1;
      tryMoveTo({ x: lastPoint.x + dir, y: lastPoint.y }, dx);
    } else {
      const dir = dy > 0 ? 1 : -1;
      tryMoveTo({ x: lastPoint.x, y: lastPoint.y + dir }, dy);
    }
    const neighbors = [
      { x: lastPoint.x + 1, y: lastPoint.y },
      { x: lastPoint.x - 1, y: lastPoint.y },
      { x: lastPoint.x, y: lastPoint.y + 1 },
      { x: lastPoint.x, y: lastPoint.y - 1 }
    ];
    const symPath = this.getSymmetryPath(this.path);
    for (const n of neighbors) {
      if (n.x >= 0 && n.x <= this.puzzle.cols && n.y >= 0 && n.y <= this.puzzle.rows) {
        const nPos = this.getCanvasCoords(n.x, n.y);
        const dist = Math.hypot(nPos.x - this.currentMousePos.x, nPos.y - this.currentMousePos.y);
        if (dist < this.options.cellSize * 0.3) {
          const idx = this.path.findIndex((p) => p.x === n.x && p.y === n.y);
          if (idx === -1) {
            if (symmetry !== 0 /* None */) {
              const sn = this.getSymmetricalPoint(n);
              if (n.x === sn.x && n.y === sn.y) continue;
              if (this.path.some((p) => p.x === sn.x && p.y === sn.y)) continue;
              if (symPath.some((p) => p.x === n.x && p.y === n.y)) continue;
              const edgeKey = this.getEdgeKey(lastPoint, n);
              const symEdgeKey = this.getEdgeKey(this.getSymmetricalPoint(lastPoint), sn);
              if (edgeKey === symEdgeKey) continue;
            }
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
      const dx_exit = this.currentMousePos.x - lastPos.x;
      const dy_exit = this.currentMousePos.y - lastPos.y;
      const dot = dx_exit * exitDir.x + dy_exit * exitDir.y;
      if (dot > 0) {
        this.exitTipPos = {
          x: lastPos.x + exitDir.x * this.options.exitLength,
          y: lastPos.y + exitDir.y * this.options.exitLength
        };
        this.options.onPathComplete(this.path);
        return;
      }
    }
    this.exitTipPos = exitDir ? { ...this.currentMousePos } : null;
    this.startFade(this.options.colors.interrupted);
  }
  /**
   * 二点間のエッジタイプを取得する
   * @param p1 点1
   * @param p2 点2
   * @returns エッジタイプ
   */
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
  /**
   * パスのフェードアウトアニメーションを開始する
   * @param color フェード時の色
   */
  startFade(color = "#ff4444") {
    this.isFading = true;
    this.fadeOpacity = 1;
    this.fadeColor = color;
    this.fadingPath = [...this.path];
    this.fadingTipPos = this.exitTipPos ? { ...this.exitTipPos } : null;
    this.path = [];
  }
  /**
   * 現在のフェードアニメーションを中止する
   */
  cancelFade() {
    this.isFading = false;
  }
  /**
   * アニメーションループ
   */
  animate() {
    const now = Date.now();
    if (this.isFading) {
      const step = 1e3 / (this.options.animations.fadeDuration * 60);
      this.fadeOpacity -= step;
      if (this.fadeOpacity <= 0) {
        this.isFading = false;
        this.fadeOpacity = 0;
      }
    }
    if (this.isInvalidPath && !this.options.stayPathOnError && !this.isFading && this.path.length > 0) {
      this.startFade(this.options.colors.error);
    }
    this.draw();
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => this.animate());
    }
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
      if (this.puzzle.symmetry !== void 0 && this.puzzle.symmetry !== 0 /* None */) {
        const symFadingPath = this.getSymmetryPath(this.fadingPath);
        let symColor = this.options.colors.symmetry;
        if (this.isInvalidPath) {
          const originalSymAlpha = this.colorToRgba(symColor).a;
          symColor = this.setAlpha(this.options.colors.error, originalSymAlpha);
        }
        let symTipPos = null;
        if (this.fadingTipPos) {
          const gridRelX = (this.fadingTipPos.x - this.options.gridPadding) / this.options.cellSize;
          const gridRelY = (this.fadingTipPos.y - this.options.gridPadding) / this.options.cellSize;
          const symGridRel = this.getSymmetricalPoint({ x: gridRelX, y: gridRelY });
          symTipPos = {
            x: symGridRel.x * this.options.cellSize + this.options.gridPadding,
            y: symGridRel.y * this.options.cellSize + this.options.gridPadding
          };
        }
        this.drawPath(ctx, symFadingPath, false, symColor, this.fadeOpacity, symTipPos);
      }
    } else if (this.path.length > 0) {
      const originalPathColor = this.options.colors.path;
      const originalPathAlpha = this.colorToRgba(originalPathColor).a;
      const errorColor = this.options.colors.error;
      let color = this.isInvalidPath ? this.setAlpha(errorColor, originalPathAlpha) : originalPathColor;
      if (this.isSuccessFading && !this.puzzle.symmetry) {
        color = this.setAlpha(this.options.colors.success, originalPathAlpha);
      }
      let pathOpacity = 1;
      if (!this.isDrawing && this.exitTipPos && !this.isInvalidPath) {
        const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
        const blinkDuration = this.options.animations.blinkDuration;
        if (elapsed < blinkDuration) {
          if (this.isSuccessFading) {
            const hasNegation = this.invalidatedCells.length > 0 || this.invalidatedEdges.length > 0 || this.invalidatedNodes.length > 0;
            if (hasNegation && this.options.blinkMarksOnError) {
              color = this.options.colors.error;
              if (!this.options.stayPathOnError) {
                pathOpacity = Math.max(0, 1 - elapsed / this.options.animations.fadeDuration);
              }
            }
          }
        }
      }
      this.drawPath(ctx, this.path, this.isDrawing, color, pathOpacity, this.isDrawing ? this.currentMousePos : this.exitTipPos);
      if (this.puzzle.symmetry !== void 0 && this.puzzle.symmetry !== 0 /* None */) {
        const symPath = this.getSymmetryPath(this.path);
        const originalSymColor = this.options.colors.symmetry;
        const originalSymAlpha = this.colorToRgba(originalSymColor).a;
        let symColor = originalSymColor;
        let symPathOpacity = pathOpacity;
        if (this.isInvalidPath) {
          symColor = this.setAlpha(errorColor, originalSymAlpha);
        }
        if (!this.isDrawing && this.exitTipPos && !this.isInvalidPath) {
          const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
          const blinkDuration = this.options.animations.blinkDuration;
          if (elapsed < blinkDuration) {
            if (this.isSuccessFading) {
              const hasNegation = this.invalidatedCells.length > 0 || this.invalidatedEdges.length > 0 || this.invalidatedNodes.length > 0;
              if (hasNegation && this.options.blinkMarksOnError) {
                symColor = this.options.colors.error;
              }
            }
          }
        }
        let symTipPos = null;
        if (this.isDrawing || this.exitTipPos) {
          const tip = this.isDrawing ? this.currentMousePos : this.exitTipPos;
          const gridRelX = (tip.x - this.options.gridPadding) / this.options.cellSize;
          const gridRelY = (tip.y - this.options.gridPadding) / this.options.cellSize;
          const symGridRel = this.getSymmetricalPoint({ x: gridRelX, y: gridRelY }, true);
          symTipPos = {
            x: symGridRel.x * this.options.cellSize + this.options.gridPadding,
            y: symGridRel.y * this.options.cellSize + this.options.gridPadding
          };
        }
        this.drawPath(ctx, symPath, this.isDrawing, symColor, symPathOpacity, symTipPos);
      }
    }
  }
  /**
   * ゴール地点の波紋アニメーションを描画する
   * @param ctx 描画コンテキスト
   */
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
  /**
   * グリッド（背景の線）を描画する
   * @param ctx 描画コンテキスト
   */
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
  /**
   * 全ての制約記号（四角、星、六角形など）を描画する
   * @param ctx 描画コンテキスト
   */
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
        if (isError && this.options.blinkMarksOnError) {
          overrideColor = this.lerpColor(originalColor, errorColor, blinkFactor);
        }
        if (isInvalidated) {
          const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
          const blinkDuration = this.options.animations.blinkDuration;
          if (elapsed < blinkDuration) {
            if (this.options.blinkMarksOnError) {
              const transitionIn = Math.min(1, elapsed / 200);
              const transitionOut = elapsed > blinkDuration * 0.8 ? (blinkDuration - elapsed) / (blinkDuration * 0.2) : 1;
              const transitionFactor = Math.min(transitionIn, transitionOut);
              overrideColor = this.lerpColor(originalColor, errorColor, blinkFactor * transitionFactor);
            }
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
    const getHexColor = (type) => {
      if (type === 3 /* Hexagon */ || type === 3 /* Hexagon */) return this.options.colors.hexagon;
      if (type === 4 /* HexagonMain */ || type === 4 /* HexagonMain */) return this.options.colors.hexagonMain;
      if (type === 5 /* HexagonSymmetry */ || type === 5 /* HexagonSymmetry */) return this.options.colors.hexagonSymmetry;
      return this.options.colors.hexagon;
    };
    for (let r = 0; r <= this.puzzle.rows; r++) {
      for (let c = 0; c < this.puzzle.cols; c++) {
        const type = this.puzzle.hEdges[r][c].type;
        if (type === 3 /* Hexagon */ || type === 4 /* HexagonMain */ || type === 5 /* HexagonSymmetry */) {
          const pos = this.getCanvasCoords(c + 0.5, r);
          ctx.save();
          const isInvalidated = this.invalidatedEdges.some((e) => e.type === "h" && e.r === r && e.c === c);
          const isError = this.errorEdges.some((e) => e.type === "h" && e.r === r && e.c === c);
          const baseColor = getHexColor(type);
          if (isError && this.options.blinkMarksOnError) {
            const color = this.lerpColor(baseColor, this.options.colors.error, blinkFactor);
            this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
          } else if (isInvalidated) {
            const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
            const blinkDuration = this.options.animations.blinkDuration;
            if (elapsed < blinkDuration) {
              if (this.options.blinkMarksOnError) {
                const transitionIn = Math.min(1, elapsed / 200);
                const transitionOut = elapsed > blinkDuration * 0.8 ? (blinkDuration - elapsed) / (blinkDuration * 0.2) : 1;
                const transitionFactor = Math.min(transitionIn, transitionOut);
                const color = this.lerpColor(baseColor, this.options.colors.error, blinkFactor * transitionFactor);
                this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
              } else {
                this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
              }
            } else {
              ctx.globalAlpha *= Math.max(0.3, 1 - (elapsed - blinkDuration) / this.options.animations.fadeDuration);
              this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
            }
          } else {
            this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
          }
          ctx.restore();
        }
      }
    }
    for (let r = 0; r < this.puzzle.rows; r++) {
      for (let c = 0; c <= this.puzzle.cols; c++) {
        const type = this.puzzle.vEdges[r][c].type;
        if (type === 3 /* Hexagon */ || type === 4 /* HexagonMain */ || type === 5 /* HexagonSymmetry */) {
          const pos = this.getCanvasCoords(c, r + 0.5);
          ctx.save();
          const isInvalidated = this.invalidatedEdges.some((e) => e.type === "v" && e.r === r && e.c === c);
          const isError = this.errorEdges.some((e) => e.type === "v" && e.r === r && e.c === c);
          const baseColor = getHexColor(type);
          if (isError && this.options.blinkMarksOnError) {
            const color = this.lerpColor(baseColor, this.options.colors.error, blinkFactor);
            this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
          } else if (isInvalidated) {
            const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
            const blinkDuration = this.options.animations.blinkDuration;
            if (elapsed < blinkDuration) {
              if (this.options.blinkMarksOnError) {
                const transitionIn = Math.min(1, elapsed / 200);
                const transitionOut = elapsed > blinkDuration * 0.8 ? (blinkDuration - elapsed) / (blinkDuration * 0.2) : 1;
                const transitionFactor = Math.min(transitionIn, transitionOut);
                const color = this.lerpColor(baseColor, this.options.colors.error, blinkFactor * transitionFactor);
                this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
              } else {
                this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
              }
            } else {
              ctx.globalAlpha *= Math.max(0.3, 1 - (elapsed - blinkDuration) / this.options.animations.fadeDuration);
              this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
            }
          } else {
            this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
          }
          ctx.restore();
        }
      }
    }
    for (let r = 0; r <= this.puzzle.rows; r++) {
      for (let c = 0; c <= this.puzzle.cols; c++) {
        const type = this.puzzle.nodes[r][c].type;
        if (type === 3 /* Hexagon */ || type === 4 /* HexagonMain */ || type === 5 /* HexagonSymmetry */) {
          const pos = this.getCanvasCoords(c, r);
          ctx.save();
          const isInvalidated = this.invalidatedNodes.some((p) => p.x === c && p.y === r);
          const isError = this.errorNodes.some((p) => p.x === c && p.y === r);
          const baseColor = getHexColor(type);
          if (isError && this.options.blinkMarksOnError) {
            const color = this.lerpColor(baseColor, this.options.colors.error, blinkFactor);
            this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
          } else if (isInvalidated) {
            const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
            const blinkDuration = this.options.animations.blinkDuration;
            if (elapsed < blinkDuration) {
              if (this.options.blinkMarksOnError) {
                const transitionIn = Math.min(1, elapsed / 200);
                const transitionOut = elapsed > blinkDuration * 0.8 ? (blinkDuration - elapsed) / (blinkDuration * 0.2) : 1;
                const transitionFactor = Math.min(transitionIn, transitionOut);
                const color = this.lerpColor(baseColor, this.options.colors.error, blinkFactor * transitionFactor);
                this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
              } else {
                this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
              }
            } else {
              ctx.globalAlpha *= Math.max(0.3, 1 - (elapsed - blinkDuration) / this.options.animations.fadeDuration);
              this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
            }
          } else {
            this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
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
      this.drawTetris(ctx, pos.x, pos.y, cell.shape || [], cell.type === 4 /* TetrisRotated */, cell.color, false, overrideColor);
    } else if (cell.type === 6 /* TetrisNegative */ || cell.type === 7 /* TetrisNegativeRotated */) {
      this.drawTetris(ctx, pos.x, pos.y, cell.shape || [], cell.type === 7 /* TetrisNegativeRotated */, cell.color, true, overrideColor);
    } else if (cell.type === 5 /* Eraser */) {
      this.drawEraser(ctx, pos.x, pos.y, 14, 3, cell.color, overrideColor);
    }
  }
  /**
   * 全てのノード（交点、始点、終点）を描画する
   * @param ctx 描画コンテキスト
   */
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
        if (node.type === 3 /* Hexagon */ || node.type === 4 /* HexagonMain */ || node.type === 5 /* HexagonSymmetry */) continue;
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
  /**
   * 解答パスを描画する（オフスクリーン合成により重なりを防止）
   * @param ctx 描画コンテキスト
   * @param path パス座標配列
   * @param isDrawing 描画中かどうか
   * @param color パスの色
   * @param opacity 不透明度
   * @param tipPos 先端の座標（描画中用）
   */
  drawPath(ctx, path, isDrawing, color, opacity, tipPos = null) {
    if (path.length === 0 || !color || color === "transparent") return;
    const rgba = this.colorToRgba(color);
    const finalColor = `rgb(${rgba.r},${rgba.g},${rgba.b})`;
    const finalOpacity = opacity * rgba.a;
    const { canvas: tempCanvas, ctx: tempCtx } = this.prepareOffscreen();
    this.drawPathInternal(tempCtx, path, isDrawing, finalColor, tipPos);
    ctx.save();
    ctx.globalAlpha = finalOpacity;
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
  }
  /**
   * 解答パスの実際の描画処理
   * @param ctx 描画コンテキスト
   * @param path パス座標配列
   * @param isDrawing 描画中かどうか
   * @param color パスの色
   * @param tipPos 先端の座標
   */
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
    const actualTipPos = tipPos || this.currentMousePos;
    if (isDrawing || tipPos) {
      ctx.lineTo(actualTipPos.x, actualTipPos.y);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(startPos.x, startPos.y, this.options.startNodeRadius, 0, Math.PI * 2);
    ctx.fill();
    if (isDrawing || tipPos) {
      ctx.beginPath();
      ctx.arc(actualTipPos.x, actualTipPos.y, this.options.pathWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  /**
   * 角丸長方形を描画する
   */
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
  /**
   * 六角形（通過必須マーク）を描画する
   */
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
  /**
   * 消しゴム（テトラポッド）を描画する
   */
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
  /**
   * 星を描画する
   */
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
  /**
   * テトリスピースを描画する
   */
  drawTetris(ctx, x, y, shape, rotated, colorEnum, isNegative, overrideColor) {
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
    const color = overrideColor || this.getColorCode(colorEnum, isNegative ? "#00ffff" : "#ffcc00");
    if (isNegative) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            const px = c * (cellSize + gap) - totalW / 2;
            const py = r * (cellSize + gap) - totalH / 2;
            ctx.strokeRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
          }
        }
      }
    } else {
      ctx.fillStyle = color;
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            const px = c * (cellSize + gap) - totalW / 2;
            const py = r * (cellSize + gap) - totalH / 2;
            ctx.fillRect(px, py, cellSize, cellSize);
          }
        }
      }
    }
    ctx.restore();
  }
  /**
   * Color値に対応するカラーコードを取得する
   * @param colorEnum Color値
   * @param defaultFallback 見つからない場合のデフォルト
   * @returns カラーコード文字列
   */
  getColorCode(colorEnum, defaultFallback = "#666") {
    if (this.options.colors.colorList && this.options.colors.colorList[colorEnum] !== void 0) {
      return this.options.colors.colorList[colorEnum];
    }
    if (this.options.colors.colorMap && this.options.colors.colorMap[colorEnum] !== void 0) {
      return this.options.colors.colorMap[colorEnum];
    }
    return defaultFallback;
  }
  /**
   * カラー文字列をRGBA成分に分解する
   * @param color #hex または rgba() 文字列
   * @returns RGBAオブジェクト
   */
  colorToRgba(color) {
    if (!color || color === "transparent") {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    if (color.startsWith("rgba") || color.startsWith("rgb")) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (match) {
        return {
          r: parseInt(match[1]),
          g: parseInt(match[2]),
          b: parseInt(match[3]),
          a: match[4] ? parseFloat(match[4]) : 1
        };
      }
    }
    let c = color.startsWith("#") ? color.slice(1) : color;
    if (c.length === 3 || c.length === 4) {
      c = c.split("").map((s) => s + s).join("");
    }
    if (c.length === 6) {
      const i = parseInt(c, 16);
      return {
        r: i >> 16 & 255,
        g: i >> 8 & 255,
        b: i & 255,
        a: 1
      };
    } else if (c.length === 8) {
      const i = parseInt(c, 16);
      return {
        r: i >> 24 & 255,
        g: i >> 16 & 255,
        b: i >> 8 & 255,
        a: (i & 255) / 255
      };
    }
    return { r: 0, g: 0, b: 0, a: 1 };
  }
  /**
   * 二つの色を線形補間する
   * @param c1 色1
   * @param c2 色2
   * @param t 割合 (0.0 - 1.0)
   * @returns 補間後の色 (rgba形式)
   */
  lerpColor(c1, c2, t) {
    try {
      const rgba1 = this.colorToRgba(c1);
      const rgba2 = this.colorToRgba(c2);
      const r = Math.round(rgba1.r + (rgba2.r - rgba1.r) * t);
      const g = Math.round(rgba1.g + (rgba2.g - rgba1.g) * t);
      const b = Math.round(rgba1.b + (rgba2.b - rgba1.b) * t);
      const a = rgba1.a + (rgba2.a - rgba1.a) * t;
      return `rgba(${r},${g},${b},${a})`;
    } catch (e) {
      return c1;
    }
  }
  /**
   * 色のアルファ値を上書きする
   * @param color 元の色
   * @param alpha 新しいアルファ値
   * @returns 変更後の色
   */
  setAlpha(color, alpha) {
    const rgba = this.colorToRgba(color);
    return `rgba(${rgba.r},${rgba.g},${rgba.b},${alpha})`;
  }
  /**
   * 指定されたパスの対称パスを生成する
   * @param path メインパス
   * @returns 対称パス
   */
  getSymmetryPath(path) {
    if (!this.puzzle || !this.puzzle.symmetry) return [];
    return path.map((p) => this.getSymmetricalPoint(p));
  }
  /**
   * 指定された点の対称点を取得する
   * @param p 元の点
   * @param isFloat 小数点座標を維持するか
   * @returns 対称点
   */
  getSymmetricalPoint(p, isFloat = false) {
    if (!this.puzzle || !this.puzzle.symmetry) return { ...p };
    const { cols, rows, symmetry } = this.puzzle;
    if (symmetry === 1 /* Horizontal */) {
      return { x: cols - p.x, y: p.y };
    } else if (symmetry === 2 /* Vertical */) {
      return { x: p.x, y: rows - p.y };
    } else if (symmetry === 3 /* Rotational */) {
      return { x: cols - p.x, y: rows - p.y };
    }
    return { ...p };
  }
  /**
   * 二点間のエッジを識別するユニークなキーを取得する
   */
  getEdgeKey(p1, p2) {
    return p1.x < p2.x || p1.x === p2.x && p1.y < p2.y ? `${p1.x},${p1.y}-${p2.x},${p2.y}` : `${p2.x},${p2.y}-${p1.x},${p1.y}`;
  }
  /**
   * 合成用のオフスクリーンCanvasを準備する
   */
  prepareOffscreen() {
    if (!this.offscreenCanvas) {
      if (typeof document !== "undefined") {
        this.offscreenCanvas = document.createElement("canvas");
      } else if (typeof OffscreenCanvas !== "undefined") {
        this.offscreenCanvas = new OffscreenCanvas(this.canvas.width, this.canvas.height);
      } else {
        throw new Error("Offscreen canvas not supported in this environment.");
      }
      this.offscreenCtx = this.offscreenCanvas.getContext("2d");
    }
    if (this.offscreenCanvas.width !== this.canvas.width || this.offscreenCanvas.height !== this.canvas.height) {
      this.offscreenCanvas.width = this.canvas.width;
      this.offscreenCanvas.height = this.canvas.height;
    }
    if (!this.offscreenCtx) throw new Error("Could not get offscreen 2D context.");
    this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
    return { canvas: this.offscreenCanvas, ctx: this.offscreenCtx };
  }
};

// src/index.ts
var WitnessCore = class {
  generator;
  validator;
  /**
   * インスタンスを生成する
   */
  constructor() {
    this.generator = new PuzzleGenerator();
    this.validator = new PuzzleValidator();
  }
  /**
   * 指定されたサイズとオプションで新しいパズルを生成する
   * @param rows 行数
   * @param cols 列数
   * @param options 生成オプション
   * @returns 生成されたパズルデータ
   */
  createPuzzle(rows, cols, options = {}) {
    const grid = this.generator.generate(rows, cols, options);
    return grid.export();
  }
  /**
   * 与えられたパズルデータに対して解答パスを検証する
   * @param puzzleData パズルデータ
   * @param solution 解答パス
   * @returns 検証結果
   */
  validateSolution(puzzleData, solution) {
    const grid = Grid.fromData(puzzleData);
    return this.validator.validate(grid, solution);
  }
  /**
   * パズルデータの難易度を算出する
   * @param puzzleData パズルデータ
   * @returns 難易度スコア (0.0 - 1.0)
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
  SymmetryType,
  WitnessCore,
  WitnessUI
};
//# sourceMappingURL=MiniWitness.js.map
