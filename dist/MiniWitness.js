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
  return CellType2;
})(CellType || {});
var EdgeType = /* @__PURE__ */ ((EdgeType2) => {
  EdgeType2[EdgeType2["Normal"] = 0] = "Normal";
  EdgeType2[EdgeType2["Hexagon"] = 1] = "Hexagon";
  EdgeType2[EdgeType2["Broken"] = 2] = "Broken";
  return EdgeType2;
})(EdgeType || {});
var NodeType = /* @__PURE__ */ ((NodeType2) => {
  NodeType2[NodeType2["Normal"] = 0] = "Normal";
  NodeType2[NodeType2["Start"] = 1] = "Start";
  NodeType2[NodeType2["End"] = 2] = "End";
  return NodeType2;
})(NodeType || {});
var Color = /* @__PURE__ */ ((Color2) => {
  Color2[Color2["None"] = 0] = "None";
  Color2[Color2["Black"] = 1] = "Black";
  Color2[Color2["White"] = 2] = "White";
  Color2[Color2["Red"] = 3] = "Red";
  Color2[Color2["Blue"] = 4] = "Blue";
  return Color2;
})(Color || {});

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
    this.cells = Array.from({ length: this.rows }, () => Array.from({ length: this.cols }, () => ({ type: 0 /* None */, color: 0 /* None */ })));
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

// src/generator.ts
var PuzzleGenerator = class {
  /**
   * パズルを生成する
   * @param rows 行数
   * @param cols 列数
   * @param complexity 複雑度 (0.0 - 1.0)
   */
  generate(rows, cols, complexity = 0.5) {
    const grid = new Grid(rows, cols);
    const startPoint = { x: 0, y: rows };
    const endPoint = { x: cols, y: 0 };
    grid.nodes[startPoint.y][startPoint.x].type = 1 /* Start */;
    grid.nodes[endPoint.y][endPoint.x].type = 2 /* End */;
    const solutionPath = this.generateRandomPath(grid, startPoint, endPoint);
    this.applyConstraintsBasedOnPath(grid, solutionPath, complexity);
    return grid;
  }
  /**
   * Randomized DFSを用いてStartからEndへの一本道を生成する
   */
  generateRandomPath(grid, start, end) {
    const visited = /* @__PURE__ */ new Set();
    const path = [];
    const stack = [start];
    const parentMap = /* @__PURE__ */ new Map();
    parentMap.set(`${start.x},${start.y}`, null);
    const findPath = (current) => {
      visited.add(`${current.x},${current.y}`);
      path.push(current);
      if (current.x === end.x && current.y === end.y) {
        return true;
      }
      const neighbors = this.getValidNeighbors(grid, current, visited);
      this.shuffleArray(neighbors);
      for (const next of neighbors) {
        if (findPath(next)) {
          return true;
        }
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
      // Up
      { x: 1, y: 0 },
      // Right
      { x: 0, y: 1 },
      // Down
      { x: -1, y: 0 }
      // Left
    ];
    for (const d of directions) {
      const nx = p.x + d.x;
      const ny = p.y + d.y;
      if (nx >= 0 && nx <= grid.cols && ny >= 0 && ny <= grid.rows) {
        if (!visited.has(`${nx},${ny}`)) {
          candidates.push({ x: nx, y: ny });
        }
      }
    }
    return candidates;
  }
  applyConstraintsBasedOnPath(grid, path, complexity) {
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];
      if (Math.random() < complexity * 0.4) {
        this.setEdgeHexagon(grid, p1, p2);
      }
    }
    const regions = this.calculateRegions(grid, path);
    if (regions.length >= 2) {
      const colorA = 1 /* Black */;
      const colorB = 2 /* White */;
      this.fillRegionWithColor(grid, regions[0], colorA, complexity);
      this.fillRegionWithColor(grid, regions[1], colorB, complexity);
    }
  }
  /**
   * パスを壁と見なして、セル（Block）の領域分割を行う (Flood Fill)
   */
  calculateRegions(grid, path) {
    const regions = [];
    const visitedCells = /* @__PURE__ */ new Set();
    const pathEdges = /* @__PURE__ */ new Set();
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];
      const k = p1.x < p2.x || p1.y < p2.y ? `${p1.x},${p1.y}-${p2.x},${p2.y}` : `${p2.x},${p2.y}-${p1.x},${p1.y}`;
      pathEdges.add(k);
    }
    const isPathEdge = (c1, c2) => {
      return false;
    };
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
            { dx: 0, dy: -1, boundary: { p1: { x: cell.x, y: cell.y }, p2: { x: cell.x + 1, y: cell.y } } },
            // Up (Boundary is Top edge)
            { dx: 0, dy: 1, boundary: { p1: { x: cell.x, y: cell.y + 1 }, p2: { x: cell.x + 1, y: cell.y + 1 } } },
            // Down (Boundary is Bottom edge)
            { dx: -1, dy: 0, boundary: { p1: { x: cell.x, y: cell.y }, p2: { x: cell.x, y: cell.y + 1 } } },
            // Left (Boundary is Left edge)
            { dx: 1, dy: 0, boundary: { p1: { x: cell.x + 1, y: cell.y }, p2: { x: cell.x + 1, y: cell.y + 1 } } }
            // Right (Boundary is Right edge)
          ];
          for (const n of neighbors) {
            const nx = cell.x + n.dx;
            const ny = cell.y + n.dy;
            if (nx >= 0 && nx < grid.cols && ny >= 0 && ny < grid.rows) {
              if (!visitedCells.has(`${nx},${ny}`)) {
                const key = n.boundary.p1.x < n.boundary.p2.x || n.boundary.p1.y < n.boundary.p2.y ? `${n.boundary.p1.x},${n.boundary.p1.y}-${n.boundary.p2.x},${n.boundary.p2.y}` : `${n.boundary.p2.x},${n.boundary.p2.y}-${n.boundary.p1.x},${n.boundary.p1.y}`;
                if (!pathEdges.has(key)) {
                  visitedCells.add(`${nx},${ny}`);
                  queue.push({ x: nx, y: ny });
                }
              }
            }
          }
        }
        regions.push(currentRegion);
      }
    }
    return regions;
  }
  fillRegionWithColor(grid, cells, color, density) {
    for (const cell of cells) {
      if (Math.random() < density) {
        grid.cells[cell.y][cell.x].type = 1 /* Square */;
        grid.cells[cell.y][cell.x].color = color;
      }
    }
  }
  setEdgeHexagon(grid, p1, p2) {
    if (p1.x === p2.x) {
      const y = Math.min(p1.y, p2.y);
      grid.vEdges[y][p1.x].type = 1 /* Hexagon */;
    } else {
      const x = Math.min(p1.x, p2.x);
      grid.hEdges[p1.y][x].type = 1 /* Hexagon */;
    }
  }
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
};

// src/validator.ts
var PuzzleValidator = class {
  validate(grid, solution) {
    const path = solution.points;
    if (path.length < 2) return { isValid: false, errorReason: "Path too short" };
    const start = path[0];
    const end = path[path.length - 1];
    if (grid.nodes[start.y][start.x].type !== 1 /* Start */) {
      return { isValid: false, errorReason: "Must start at Start Node" };
    }
    if (grid.nodes[end.y][end.x].type !== 2 /* End */) {
      return { isValid: false, errorReason: "Must end at End Node" };
    }
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
      if (this.isBrokenEdge(grid, p1, p2)) {
        return { isValid: false, errorReason: "Passed through broken edge" };
      }
    }
    if (!this.checkHexagonConstraint(grid, path)) {
      return { isValid: false, errorReason: "Missed hexagon constraint" };
    }
    if (!this.checkSquareConstraint(grid, path)) {
      return { isValid: false, errorReason: "Color segregation failed" };
    }
    return { isValid: true };
  }
  isBrokenEdge(grid, p1, p2) {
    if (p1.x === p2.x) {
      const y = Math.min(p1.y, p2.y);
      return grid.vEdges[y][p1.x].type === 2 /* Broken */;
    } else {
      const x = Math.min(p1.x, p2.x);
      return grid.hEdges[p1.y][x].type === 2 /* Broken */;
    }
  }
  checkHexagonConstraint(grid, path) {
    const pathEdges = /* @__PURE__ */ new Set();
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];
      pathEdges.add(this.getEdgeKey(p1, p2));
    }
    for (let r = 0; r <= grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (r < grid.rows + 1 && grid.hEdges[r][c].type === 1 /* Hexagon */) {
          const key = this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r });
          if (!pathEdges.has(key)) return false;
        }
      }
    }
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c <= grid.cols; c++) {
        if (grid.vEdges[r][c].type === 1 /* Hexagon */) {
          const key = this.getEdgeKey({ x: c, y: r }, { x: c, y: r + 1 });
          if (!pathEdges.has(key)) return false;
        }
      }
    }
    return true;
  }
  checkSquareConstraint(grid, path) {
    const regions = this.calculateRegions(grid, path);
    for (const region of regions) {
      let firstColor = null;
      for (const cell of region) {
        const constraint = grid.cells[cell.y][cell.x];
        if (constraint.type === 1 /* Square */) {
          if (firstColor === null) {
            firstColor = constraint.color;
          } else if (firstColor !== constraint.color) {
            return false;
          }
        }
      }
    }
    return true;
  }
  calculateRegions(grid, path) {
    const regions = [];
    const visitedCells = /* @__PURE__ */ new Set();
    const pathEdges = /* @__PURE__ */ new Set();
    for (let i = 0; i < path.length - 1; i++) {
      pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
    }
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (visitedCells.has(`${c},${r}`)) continue;
        const region = [];
        const queue = [{ x: c, y: r }];
        visitedCells.add(`${c},${r}`);
        while (queue.length > 0) {
          const curr = queue.shift();
          region.push(curr);
          const neighbors = [
            { nx: curr.x, ny: curr.y - 1, p1: { x: curr.x, y: curr.y }, p2: { x: curr.x + 1, y: curr.y } },
            // Up
            { nx: curr.x, ny: curr.y + 1, p1: { x: curr.x, y: curr.y + 1 }, p2: { x: curr.x + 1, y: curr.y + 1 } },
            // Down
            { nx: curr.x - 1, ny: curr.y, p1: { x: curr.x, y: curr.y }, p2: { x: curr.x, y: curr.y + 1 } },
            // Left
            { nx: curr.x + 1, ny: curr.y, p1: { x: curr.x + 1, y: curr.y }, p2: { x: curr.x + 1, y: curr.y + 1 } }
            // Right
          ];
          for (const n of neighbors) {
            if (n.nx >= 0 && n.nx < grid.cols && n.ny >= 0 && n.ny < grid.rows) {
              if (!visitedCells.has(`${n.nx},${n.ny}`)) {
                const edgeKey = this.getEdgeKey(n.p1, n.p2);
                if (!pathEdges.has(edgeKey)) {
                  visitedCells.add(`${n.nx},${n.ny}`);
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
  getEdgeKey(p1, p2) {
    return p1.x < p2.x || p1.x === p2.x && p1.y < p2.y ? `${p1.x},${p1.y}-${p2.x},${p2.y}` : `${p2.x},${p2.y}-${p1.x},${p1.y}`;
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
  createPuzzle(rows, cols, complexity = 0.5) {
    const grid = this.generator.generate(rows, cols, complexity);
    return grid.export();
  }
  /**
   * 解答を検証する
   */
  validateSolution(puzzleData, solution) {
    const grid = Grid.fromData(puzzleData);
    return this.validator.validate(grid, solution);
  }
};
export {
  CellType,
  Color,
  Direction,
  EdgeType,
  NodeType,
  WitnessCore
};
//# sourceMappingURL=MiniWitness.js.map
