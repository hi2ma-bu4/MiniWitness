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
    if (!this.checkCellConstraints(grid, path)) {
      return { isValid: false, errorReason: "Cell constraints failed" };
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
  checkCellConstraints(grid, path) {
    const regions = this.calculateRegions(grid, path);
    for (const region of regions) {
      const colorCounts = /* @__PURE__ */ new Map();
      const starColors = /* @__PURE__ */ new Set();
      const squareColors = /* @__PURE__ */ new Set();
      for (const cell of region) {
        const constraint = grid.cells[cell.y][cell.x];
        if (constraint.type === 0 /* None */) continue;
        const color = constraint.color;
        colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
        if (constraint.type === 1 /* Square */) {
          squareColors.add(color);
        } else if (constraint.type === 2 /* Star */) {
          starColors.add(color);
        }
        if (squareColors.size > 1) return false;
      }
      for (const color of starColors) {
        if (colorCounts.get(color) !== 2) return false;
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
                const isBroken = this.isBrokenEdge(grid, n.p1, n.p2);
                if (!pathEdges.has(edgeKey) && !isBroken) {
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
  /**
   * 全ての有効な解答パスの個数をカウントする
   */
  countSolutions(grid) {
    const startNodes = [];
    for (let r = 0; r <= grid.rows; r++) {
      for (let c = 0; c <= grid.cols; c++) {
        if (grid.nodes[r][c].type === 1 /* Start */) {
          startNodes.push({ x: c, y: r });
        }
      }
    }
    let totalSolutions = 0;
    for (const start of startNodes) {
      totalSolutions += this.findPathsRecursively(grid, start, /* @__PURE__ */ new Set(), []);
    }
    return totalSolutions;
  }
  findPathsRecursively(grid, curr, visited, path) {
    const key = `${curr.x},${curr.y}`;
    visited.add(key);
    path.push(curr);
    let count = 0;
    if (grid.nodes[curr.y][curr.x].type === 2 /* End */) {
      const result = this.validate(grid, { points: path });
      if (result.isValid) {
        count = 1;
      }
    } else {
      const directions = [
        { dx: 0, dy: -1 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 }
      ];
      for (const d of directions) {
        const next = { x: curr.x + d.dx, y: curr.y + d.dy };
        if (next.x >= 0 && next.x <= grid.cols && next.y >= 0 && next.y <= grid.rows) {
          if (!visited.has(`${next.x},${next.y}`)) {
            if (!this.isBrokenEdge(grid, curr, next)) {
              count += this.findPathsRecursively(grid, next, visited, path);
            }
          }
        }
      }
    }
    path.pop();
    visited.delete(key);
    return count;
  }
};

// src/generator.ts
var PuzzleGenerator = class {
  /**
   * パズルを生成する
   * @param rows 行数
   * @param cols 列数
   * @param options 生成オプション
   */
  generate(rows, cols, options = {}) {
    const difficulty = options.difficulty ?? 0.5;
    const validator = new PuzzleValidator();
    let bestGrid = null;
    let bestScore = Infinity;
    const maxAttempts = rows * cols > 30 ? 3 : 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const grid = this.generateOnce(rows, cols, options);
      const solutionCount = validator.countSolutions(grid);
      let score;
      if (difficulty > 0.5) {
        score = Math.abs(solutionCount - 2);
      } else {
        if (solutionCount === 1) {
          score = 0;
        } else {
          score = Math.max(0, 10 - solutionCount) / 10;
        }
      }
      if (solutionCount > 0 && score < bestScore) {
        bestScore = score;
        bestGrid = grid;
      }
      if (bestScore === 0) break;
    }
    return bestGrid || this.generateOnce(rows, cols, options);
  }
  generateOnce(rows, cols, options) {
    const grid = new Grid(rows, cols);
    const startPoint = { x: 0, y: rows };
    const endPoint = { x: cols, y: 0 };
    grid.nodes[startPoint.y][startPoint.x].type = 1 /* Start */;
    grid.nodes[endPoint.y][endPoint.x].type = 2 /* End */;
    const solutionPath = this.generateRandomPath(grid, startPoint, endPoint);
    this.applyConstraintsBasedOnPath(grid, solutionPath, options);
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
  applyConstraintsBasedOnPath(grid, path, options) {
    const complexity = options.complexity ?? 0.5;
    const useHexagons = options.useHexagons ?? true;
    const useSquares = options.useSquares ?? true;
    const useStars = options.useStars ?? true;
    if (useHexagons) {
      for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i + 1];
        if (Math.random() < complexity * 0.4) {
          this.setEdgeHexagon(grid, p1, p2);
        }
      }
    }
    if (useSquares || useStars) {
      const regions = this.calculateRegions(grid, path);
      const availableColors = [1 /* Black */, 2 /* White */, 3 /* Red */, 4 /* Blue */];
      for (const region of regions) {
        if (Math.random() > 0.4 + complexity * 0.5) continue;
        const potentialCells = [...region];
        this.shuffleArray(potentialCells);
        const squareColor = availableColors[Math.floor(Math.random() * availableColors.length)];
        let numSquares = 0;
        if (useSquares && Math.random() < 0.5 + complexity * 0.3) {
          const maxSquares = Math.min(potentialCells.length, 4);
          numSquares = Math.floor(Math.random() * maxSquares);
          for (let i = 0; i < numSquares; i++) {
            const cell = potentialCells.pop();
            grid.cells[cell.y][cell.x].type = 1 /* Square */;
            grid.cells[cell.y][cell.x].color = squareColor;
          }
        }
        if (useStars) {
          for (const color of availableColors) {
            if (potentialCells.length < 1) break;
            if (Math.random() > 0.2 + complexity * 0.3) continue;
            if (color === squareColor) {
              if (numSquares === 1 && potentialCells.length >= 1) {
                const cell = potentialCells.pop();
                grid.cells[cell.y][cell.x].type = 2 /* Star */;
                grid.cells[cell.y][cell.x].color = color;
              } else if (numSquares === 0 && potentialCells.length >= 2) {
                for (let i = 0; i < 2; i++) {
                  const cell = potentialCells.pop();
                  grid.cells[cell.y][cell.x].type = 2 /* Star */;
                  grid.cells[cell.y][cell.x].color = color;
                }
              }
            } else {
              if (potentialCells.length >= 2) {
                for (let i = 0; i < 2; i++) {
                  const cell = potentialCells.pop();
                  grid.cells[cell.y][cell.x].type = 2 /* Star */;
                  grid.cells[cell.y][cell.x].color = color;
                }
              }
            }
          }
        }
      }
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
};
export {
  CellType,
  Color,
  Direction,
  EdgeType,
  Grid,
  NodeType,
  PuzzleGenerator,
  PuzzleValidator,
  WitnessCore
};
//# sourceMappingURL=MiniWitness.js.map
