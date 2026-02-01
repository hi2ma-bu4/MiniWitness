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
  isAbsentEdge(grid, p1, p2) {
    if (p1.x === p2.x) {
      const y = Math.min(p1.y, p2.y);
      return grid.vEdges[y][p1.x].type === 2 /* Absent */;
    } else {
      const x = Math.min(p1.x, p2.x);
      return grid.hEdges[p1.y][x].type === 2 /* Absent */;
    }
  }
  checkHexagonConstraint(grid, path) {
    const pathEdges = /* @__PURE__ */ new Set();
    for (let i = 0; i < path.length - 1; i++) {
      pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
    }
    for (let r = 0; r <= grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (grid.hEdges[r][c].type === 3 /* Hexagon */) {
          const key = this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r });
          if (!pathEdges.has(key)) return false;
        }
      }
    }
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c <= grid.cols; c++) {
        if (grid.vEdges[r][c].type === 3 /* Hexagon */) {
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
      const tetrisPieces = [];
      for (const cell of region) {
        const constraint = grid.cells[cell.y][cell.x];
        if (constraint.type === 0 /* None */) continue;
        const color = constraint.color;
        colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
        if (constraint.type === 1 /* Square */) {
          squareColors.add(color);
        } else if (constraint.type === 2 /* Star */) {
          starColors.add(color);
        } else if (constraint.type === 3 /* Tetris */ || constraint.type === 4 /* TetrisRotated */) {
          if (constraint.shape) {
            tetrisPieces.push({
              shape: constraint.shape,
              rotatable: constraint.type === 4 /* TetrisRotated */
            });
          }
        }
        if (squareColors.size > 1) return false;
      }
      for (const color of starColors) {
        if (colorCounts.get(color) !== 2) return false;
      }
      if (tetrisPieces.length > 0) {
        if (!this.checkTetrisConstraint(region, tetrisPieces)) {
          return false;
        }
      }
    }
    return true;
  }
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
    for (const p of region) {
      regionGrid[p.y - minY][p.x - minX] = true;
    }
    return this.canTile(regionGrid, pieces);
  }
  getShapeArea(shape) {
    let area = 0;
    for (const row of shape) {
      for (const cell of row) {
        if (cell) area++;
      }
    }
    return area;
  }
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
    if (r0 === -1) {
      return pieces.length === 0;
    }
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
          if (nr < 0 || nr >= regionGrid.length || nc < 0 || nc >= regionGrid[0].length || !regionGrid[nr][nc]) {
            return false;
          }
        }
      }
    }
    return true;
  }
  placePiece(regionGrid, shape, r, c, value) {
    for (let i = 0; i < shape.length; i++) {
      for (let j = 0; j < shape[0].length; j++) {
        if (shape[i][j]) {
          regionGrid[r + i][c + j] = value;
        }
      }
    }
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
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        newShape[c][rows - 1 - r] = shape[r][c];
      }
    }
    return newShape;
  }
  calculateRegions(grid, path) {
    const regions = [];
    const visitedCells = /* @__PURE__ */ new Set();
    const pathEdges = /* @__PURE__ */ new Set();
    for (let i = 0; i < path.length - 1; i++) {
      pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
    }
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
              const neighborKey = `${n.nx},${n.ny}`;
              if (!visitedCells.has(neighborKey) && !externalCells.has(neighborKey)) {
                const edgeKey = this.getEdgeKey(n.p1, n.p2);
                const isAbsent = this.isAbsentEdge(grid, n.p1, n.p2);
                if (!pathEdges.has(edgeKey) && !isAbsent) {
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
        // Up
        { nx: curr.x, ny: curr.y + 1, edge: grid.hEdges[curr.y + 1][curr.x] },
        // Down
        { nx: curr.x - 1, ny: curr.y, edge: grid.vEdges[curr.y][curr.x] },
        // Left
        { nx: curr.x + 1, ny: curr.y, edge: grid.vEdges[curr.y][curr.x + 1] }
        // Right
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
   * パズルの難易度を計算する（0.0 - 1.0）
   * 知的なアルゴリズム：探索空間の広さ、分岐数、強制手、解の数などを分析
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
          const isBlocked = type === 1 /* Broken */ || type === 2 /* Absent */;
          adj[u].push({ next: v, isHexagon, isBroken: isBlocked });
          adj[v].push({ next: u, isHexagon, isBroken: isBlocked });
          if (isHexagon) hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r }));
        }
        if (r < rows) {
          const v = u + nodeCols;
          const type = grid.vEdges[r][c].type;
          const isHexagon = type === 3 /* Hexagon */;
          const isBlocked = type === 1 /* Broken */ || type === 2 /* Absent */;
          adj[u].push({ next: v, isHexagon, isBroken: isBlocked });
          adj[v].push({ next: u, isHexagon, isBroken: isBlocked });
          if (isHexagon) hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c, y: r + 1 }));
        }
      }
    }
    const stats = {
      totalNodesVisited: 0,
      branchingPoints: 0,
      solutions: 0,
      maxDepth: 0,
      backtracks: 0
    };
    const totalHexagons = hexagonEdges.size;
    const fingerprints = /* @__PURE__ */ new Set();
    for (const startIdx of startNodes) {
      this.exploreSearchSpace(grid, startIdx, 1n << BigInt(startIdx), [startIdx], 0, totalHexagons, adj, endNodes, fingerprints, stats, 500);
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
          if (cell.type === 3 /* Tetris */) {
            tetrisCount++;
          } else if (cell.type === 4 /* TetrisRotated */) {
            tetrisCount++;
            rotatedTetrisCount++;
          }
        }
      }
    }
    const branchingFactor = stats.branchingPoints / (stats.totalNodesVisited || 1);
    const searchComplexity = Math.log10(stats.totalNodesVisited + 1);
    let difficulty = (branchingFactor * 10 + searchComplexity * 1) / (Math.log2(stats.solutions + 1) + 1);
    if (tetrisCount > 0) {
      difficulty += rotatedTetrisCount * 0.5;
      difficulty += (tetrisCount - rotatedTetrisCount) * 0.2;
    }
    const cellCount = rows * cols;
    const density = constraintCount / cellCount;
    const densityFactor = density < 0.3 ? Math.pow(density / 0.3, 3) : 1;
    const typeFactor = constraintTypes.size <= 1 ? 0.4 : 1;
    difficulty *= densityFactor * typeFactor;
    const sizeFactor = Math.sqrt(cellCount) / 4;
    difficulty *= sizeFactor;
    return Math.max(0.01, Math.min(1, difficulty / 4));
  }
  exploreSearchSpace(grid, currIdx, visitedMask, path, hexagonsOnPath, totalHexagons, adj, endNodes, fingerprints, stats, limit) {
    stats.totalNodesVisited++;
    stats.maxDepth = Math.max(stats.maxDepth, path.length);
    if (stats.totalNodesVisited > limit) return;
    if (endNodes.includes(currIdx)) {
      if (hexagonsOnPath === totalHexagons) {
        const solutionPath = {
          points: path.map((idx) => ({
            x: idx % (grid.cols + 1),
            y: Math.floor(idx / (grid.cols + 1))
          }))
        };
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
      if (possible) {
        validMoves.push(edge);
      }
    }
    if (validMoves.length > 1) {
      stats.branchingPoints++;
    }
    for (const move of validMoves) {
      path.push(move.next);
      this.exploreSearchSpace(grid, move.next, visitedMask | 1n << BigInt(move.next), path, hexagonsOnPath + (move.isHexagon ? 1 : 0), totalHexagons, adj, endNodes, fingerprints, stats, limit);
      path.pop();
      if (stats.totalNodesVisited > limit) return;
    }
  }
  /**
   * 全ての有効な解答パスの個数をカウントする
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
          const isBlocked = type === 1 /* Broken */ || type === 2 /* Absent */;
          adj[u].push({ next: v, isHexagon, isBroken: isBlocked });
          adj[v].push({ next: u, isHexagon, isBroken: isBlocked });
          if (isHexagon) hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r }));
        }
        if (r < rows) {
          const v = u + nodeCols;
          const type = grid.vEdges[r][c].type;
          const isHexagon = type === 3 /* Hexagon */;
          const isBlocked = type === 1 /* Broken */ || type === 2 /* Absent */;
          adj[u].push({ next: v, isHexagon, isBroken: isBlocked });
          adj[v].push({ next: u, isHexagon, isBroken: isBlocked });
          if (isHexagon) hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c, y: r + 1 }));
        }
      }
    }
    const fingerprints = /* @__PURE__ */ new Set();
    const totalHexagons = hexagonEdges.size;
    for (const startIdx of startNodes) {
      this.findPathsOptimized(grid, startIdx, 1n << BigInt(startIdx), [startIdx], 0, totalHexagons, adj, endNodes, fingerprints, limit);
      if (fingerprints.size >= limit) break;
    }
    return fingerprints.size;
  }
  findPathsOptimized(grid, currIdx, visitedMask, path, hexagonsOnPath, totalHexagons, adj, endNodes, fingerprints, limit) {
    if (fingerprints.size >= limit) return;
    if (endNodes.includes(currIdx)) {
      if (hexagonsOnPath === totalHexagons) {
        const solutionPath = {
          points: path.map((idx) => ({
            x: idx % (grid.cols + 1),
            y: Math.floor(idx / (grid.cols + 1))
          }))
        };
        if (this.validate(grid, solutionPath).isValid) {
          fingerprints.add(this.getFingerprint(grid, solutionPath.points));
        }
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
  canReachEndOptimized(curr, visitedMask, adj, endNodes) {
    let queue = [curr];
    let localVisited = visitedMask;
    let head = 0;
    while (head < queue.length) {
      const u = queue[head++];
      if (endNodes.includes(u)) return true;
      for (const edge of adj[u]) {
        if (!edge.isBroken && !(localVisited & 1n << BigInt(edge.next))) {
          localVisited |= 1n << BigInt(edge.next);
          queue.push(edge.next);
        }
      }
    }
    return false;
  }
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
   */
  generate(rows, cols, options = {}) {
    const targetDifficulty = options.difficulty ?? 0.5;
    const validator = new PuzzleValidator();
    let bestGrid = null;
    let bestScore = -1;
    const maxAttempts = rows * cols > 30 ? 30 : 60;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const grid = this.generateOnce(rows, cols, options);
      if (!this.checkAllRequestedConstraintsPresent(grid, options)) {
        continue;
      }
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
    if (options.useBrokenEdges) {
      this.applyBrokenEdges(grid, solutionPath, options);
    }
    this.cleanGrid(grid);
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
  applyBrokenEdges(grid, path, options) {
    const complexity = options.complexity ?? 0.5;
    const pathEdges = /* @__PURE__ */ new Set();
    for (let i = 0; i < path.length - 1; i++) {
      pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
    }
    const unusedEdges = [];
    for (let r = 0; r <= grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const p1 = { x: c, y: r };
        const p2 = { x: c + 1, y: r };
        if (!pathEdges.has(this.getEdgeKey(p1, p2))) {
          unusedEdges.push({ type: "h", r, c, p1, p2 });
        }
      }
    }
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c <= grid.cols; c++) {
        const p1 = { x: c, y: r };
        const p2 = { x: c, y: r + 1 };
        if (!pathEdges.has(this.getEdgeKey(p1, p2))) {
          unusedEdges.push({ type: "v", r, c, p1, p2 });
        }
      }
    }
    this.shuffleArray(unusedEdges);
    const targetCount = Math.max(1, Math.floor(complexity * 4));
    let placed = 0;
    for (const edge of unusedEdges) {
      if (placed >= targetCount) break;
      let type = Math.random() < 0.8 ? 1 /* Broken */ : 2 /* Absent */;
      if (type === 2 /* Absent */ && this.isAdjacentToMark(grid, edge)) {
        type = 1 /* Broken */;
      }
      if (edge.type === "h") {
        grid.hEdges[edge.r][edge.c].type = type;
      } else {
        grid.vEdges[edge.r][edge.c].type = type;
      }
      placed++;
    }
    for (let r = 0; r <= grid.rows; r++) {
      for (let c = 0; c <= grid.cols; c++) {
        const edgesWithMeta = [];
        if (c > 0) edgesWithMeta.push({ e: grid.hEdges[r][c - 1], type: "h", r, c: c - 1 });
        if (c < grid.cols) edgesWithMeta.push({ e: grid.hEdges[r][c], type: "h", r, c });
        if (r > 0) edgesWithMeta.push({ e: grid.vEdges[r - 1][c], type: "v", r: r - 1, c });
        if (r < grid.rows) edgesWithMeta.push({ e: grid.vEdges[r][c], type: "v", r, c });
        const allCuts = edgesWithMeta.every((m) => m.e.type === 1 /* Broken */ || m.e.type === 2 /* Absent */);
        if (allCuts) {
          const noneNearMark = edgesWithMeta.every((m) => !this.isAdjacentToMark(grid, m));
          if (noneNearMark) {
            for (const m of edgesWithMeta) {
              m.e.type = 2 /* Absent */;
            }
          }
        }
      }
    }
  }
  cleanGrid(grid) {
    const startNodes = [];
    for (let r = 0; r <= grid.rows; r++) {
      for (let c = 0; c <= grid.cols; c++) {
        if (grid.nodes[r][c].type === 1 /* Start */) {
          startNodes.push({ x: c, y: r });
        }
      }
    }
    const reachableNodes = /* @__PURE__ */ new Set();
    const queue = [...startNodes];
    for (const p of startNodes) reachableNodes.add(`${p.x},${p.y}`);
    while (queue.length > 0) {
      const curr = queue.shift();
      const neighbors = [
        { nx: curr.x, ny: curr.y - 1, edge: grid.vEdges[curr.y - 1]?.[curr.x] },
        // Up
        { nx: curr.x, ny: curr.y + 1, edge: grid.vEdges[curr.y]?.[curr.x] },
        // Down
        { nx: curr.x - 1, ny: curr.y, edge: grid.hEdges[curr.y]?.[curr.x - 1] },
        // Left
        { nx: curr.x + 1, ny: curr.y, edge: grid.hEdges[curr.y]?.[curr.x] }
        // Right
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
      for (let c = 0; c < grid.cols; c++) {
        if (!reachableNodes.has(`${c},${r}`) || !reachableNodes.has(`${c + 1},${r}`)) {
          grid.hEdges[r][c].type = 2 /* Absent */;
        }
      }
    }
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c <= grid.cols; c++) {
        if (!reachableNodes.has(`${c},${r}`) || !reachableNodes.has(`${c},${r + 1}`)) {
          grid.vEdges[r][c].type = 2 /* Absent */;
        }
      }
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
  hasIsolatedMark(grid) {
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (grid.cells[r][c].type === 0 /* None */) continue;
        const edges = [
          grid.hEdges[r][c],
          // Top
          grid.hEdges[r + 1][c],
          // Bottom
          grid.vEdges[r][c],
          // Left
          grid.vEdges[r][c + 1]
          // Right
        ];
        const passableCount = edges.filter((e) => e.type === 0 /* Normal */ || e.type === 3 /* Hexagon */).length;
        if (passableCount === 0) return true;
      }
    }
    return false;
  }
  getEdgeKey(p1, p2) {
    return p1.x < p2.x || p1.x === p2.x && p1.y < p2.y ? `${p1.x},${p1.y}-${p2.x},${p2.y}` : `${p2.x},${p2.y}-${p1.x},${p1.y}`;
  }
  TETRIS_SHAPES = [
    [[1]],
    // 1x1
    [[1, 1]],
    // 1x2
    [[1, 1, 1]],
    // 1x3
    [
      [1, 1],
      [1, 0]
    ],
    // L-3
    [
      [0, 1],
      [1, 0]
    ],
    // 斜め2x2
    [[1, 1, 1, 1]],
    // I
    [
      [1, 1],
      [1, 1]
    ],
    // O
    [
      [1, 1, 1],
      [0, 1, 0]
    ],
    // T-2
    [
      [1, 1, 0],
      [0, 1, 1]
    ],
    // Z-2
    [
      [1, 1, 1],
      [1, 0, 0]
    ],
    // L
    [
      [1, 1, 1],
      [0, 0, 1]
    ],
    // L-i
    [
      [1, 1, 1],
      [1, 0, 1]
    ],
    // コ
    [
      [0, 1, 0],
      [1, 0, 1]
    ],
    // 斜め2x3
    [
      [1, 0, 0, 1],
      [1, 0, 0, 1]
    ],
    // サンドイッチ
    [
      [1, 1, 1],
      [0, 1, 0],
      [0, 1, 0]
    ],
    // T
    [
      [1, 1, 0],
      [0, 1, 0],
      [0, 1, 1]
    ],
    // Z
    [
      [0, 1, 1],
      [0, 1, 0],
      [1, 1, 0]
    ],
    // Z-i
    [
      [1, 1, 1],
      [1, 0, 1],
      [1, 1, 1]
    ]
    // ロ
  ];
  applyConstraintsBasedOnPath(grid, path, options) {
    const complexity = options.complexity ?? 0.5;
    const useHexagons = options.useHexagons ?? true;
    const useSquares = options.useSquares ?? true;
    const useStars = options.useStars ?? true;
    const useTetris = options.useTetris ?? false;
    let hexagonsPlaced = 0;
    let squaresPlaced = 0;
    let starsPlaced = 0;
    let tetrisPlaced = 0;
    let totalTetrisArea = 0;
    const maxTotalTetrisArea = Math.floor(grid.rows * grid.cols * 0.45);
    if (useHexagons) {
      const targetDifficulty = options.difficulty ?? 0.5;
      for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i + 1];
        const neighbors = this.getValidNeighbors(grid, p1, /* @__PURE__ */ new Set());
        const isBranching = neighbors.length > 2;
        let prob = complexity * 0.4;
        if (isBranching) {
          prob = targetDifficulty < 0.4 ? prob * 1 : prob * 0.5;
        }
        if (Math.random() < prob) {
          this.setEdgeHexagon(grid, p1, p2);
          hexagonsPlaced++;
        }
      }
      if (hexagonsPlaced === 0 && path.length >= 2) {
        const idx = Math.floor(Math.random() * (path.length - 1));
        this.setEdgeHexagon(grid, path[idx], path[idx + 1]);
      }
    }
    if (useSquares || useStars) {
      const regions = this.calculateRegions(grid, path);
      const availableColors = [1 /* Black */, 2 /* White */, 3 /* Red */, 4 /* Blue */];
      const regionIndices = Array.from({ length: regions.length }, (_, i) => i);
      this.shuffleArray(regionIndices);
      for (const idx of regionIndices) {
        const region = regions[idx];
        const skipProb = (options.difficulty ?? 0.5) > 0.7 ? 0.4 : 0.2;
        const forceOne = useSquares && squaresPlaced === 0 || useStars && starsPlaced === 0 || useTetris && tetrisPlaced === 0;
        const isLastFew = idx === regionIndices[regionIndices.length - 1];
        if (!forceOne || !isLastFew) {
          if (Math.random() > skipProb + complexity * 0.5) continue;
        }
        const potentialCells = [...region];
        this.shuffleArray(potentialCells);
        let squareColor = availableColors[Math.floor(Math.random() * availableColors.length)];
        if (useSquares && !useStars && isLastFew) {
          const currentColors = /* @__PURE__ */ new Set();
          for (let r = 0; r < grid.rows; r++) {
            for (let c = 0; c < grid.cols; c++) {
              if (grid.cells[r][c].type === 1 /* Square */) currentColors.add(grid.cells[r][c].color);
            }
          }
          if (currentColors.size === 1) {
            const otherColors = availableColors.filter((c) => !currentColors.has(c));
            if (otherColors.length > 0) {
              squareColor = otherColors[Math.floor(Math.random() * otherColors.length)];
            }
          }
        }
        let numSquares = 0;
        let shouldPlaceSquare = useSquares && Math.random() < 0.5 + complexity * 0.3;
        if (useSquares && squaresPlaced === 0 && isLastFew) shouldPlaceSquare = true;
        if (useSquares && !useStars && isLastFew) {
          const currentColors = /* @__PURE__ */ new Set();
          for (let r = 0; r < grid.rows; r++) {
            for (let c = 0; c < grid.cols; c++) {
              if (grid.cells[r][c].type === 1 /* Square */) currentColors.add(grid.cells[r][c].color);
            }
          }
          if (currentColors.size < 2 && squaresPlaced > 0) {
            shouldPlaceSquare = true;
          }
        }
        if (shouldPlaceSquare) {
          const maxSquares = Math.min(potentialCells.length, 4);
          numSquares = Math.floor(Math.random() * maxSquares);
          if (numSquares === 0 && squaresPlaced === 0) numSquares = 1;
          for (let i = 0; i < numSquares; i++) {
            if (potentialCells.length === 0) break;
            const cell = potentialCells.pop();
            grid.cells[cell.y][cell.x].type = 1 /* Square */;
            grid.cells[cell.y][cell.x].color = squareColor;
            squaresPlaced++;
          }
        }
        if (useTetris && totalTetrisArea < maxTotalTetrisArea) {
          let shouldPlaceTetris = Math.random() < 0.1 + complexity * 0.4;
          if (tetrisPlaced === 0 && isLastFew) shouldPlaceTetris = true;
          const maxTetrisPerRegion = tetrisPlaced === 0 && isLastFew ? 6 : 4;
          if (shouldPlaceTetris && potentialCells.length > 0 && region.length <= maxTetrisPerRegion * 4 && totalTetrisArea + region.length <= maxTotalTetrisArea) {
            const tiledPieces = this.generateTiling(region, maxTetrisPerRegion, options);
            if (tiledPieces) {
              for (const p of tiledPieces) {
                if (potentialCells.length === 0) break;
                const cell = potentialCells.pop();
                grid.cells[cell.y][cell.x].type = p.isRotated ? 4 /* TetrisRotated */ : 3 /* Tetris */;
                grid.cells[cell.y][cell.x].shape = p.isRotated ? p.displayShape : p.shape;
                grid.cells[cell.y][cell.x].color = 0 /* None */;
                tetrisPlaced++;
              }
              totalTetrisArea += region.length;
            }
          }
        }
        if (useStars) {
          for (const color of availableColors) {
            if (potentialCells.length < 1) break;
            let shouldPlaceStar = Math.random() < 0.2 + complexity * 0.3;
            if (starsPlaced === 0 && isLastFew) shouldPlaceStar = true;
            if (!shouldPlaceStar) continue;
            const tetrisInRegion = region.map((p) => grid.cells[p.y][p.x]).filter((c) => c.type === 3 /* Tetris */ || c.type === 4 /* TetrisRotated */);
            let existingColorCount = 0;
            if (color === squareColor) existingColorCount += numSquares;
            existingColorCount += tetrisInRegion.filter((c) => c.color === color).length;
            if (existingColorCount === 1) {
              const cell = potentialCells.pop();
              grid.cells[cell.y][cell.x].type = 2 /* Star */;
              grid.cells[cell.y][cell.x].color = color;
              starsPlaced++;
            } else if (existingColorCount === 0) {
              const uncoloredTetris = tetrisInRegion.filter((c) => c.color === 0 /* None */);
              if (color !== 4 /* Blue */ && Math.random() < 0.5 && uncoloredTetris.length > 0) {
                const t = uncoloredTetris[Math.floor(Math.random() * uncoloredTetris.length)];
                t.color = color;
                const cell = potentialCells.pop();
                grid.cells[cell.y][cell.x].type = 2 /* Star */;
                grid.cells[cell.y][cell.x].color = color;
                starsPlaced++;
              } else if (potentialCells.length >= 2) {
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
      if (useStars && starsPlaced === 0) {
        for (const region of regions) {
          if (region.length >= 2) {
            const potentialCells = [...region].filter((p) => grid.cells[p.y][p.x].type === 0 /* None */);
            if (potentialCells.length >= 2) {
              const color = availableColors[Math.floor(Math.random() * availableColors.length)];
              for (let i = 0; i < 2; i++) {
                const cell = potentialCells.pop();
                grid.cells[cell.y][cell.x].type = 2 /* Star */;
                grid.cells[cell.y][cell.x].color = color;
                starsPlaced++;
              }
              break;
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
                if (!pathEdges.has(key) && !this.isAbsentEdge(grid, n.boundary.p1, n.boundary.p2)) {
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
  isAbsentEdge(grid, p1, p2) {
    if (p1.x === p2.x) {
      const y = Math.min(p1.y, p2.y);
      return grid.vEdges[y][p1.x].type === 2 /* Absent */;
    } else {
      const x = Math.min(p1.x, p2.x);
      return grid.hEdges[p1.y][x].type === 2 /* Absent */;
    }
  }
  setEdgeHexagon(grid, p1, p2) {
    if (p1.x === p2.x) {
      const y = Math.min(p1.y, p2.y);
      grid.vEdges[y][p1.x].type = 3 /* Hexagon */;
    } else {
      const x = Math.min(p1.x, p2.x);
      grid.hEdges[p1.y][x].type = 3 /* Hexagon */;
    }
  }
  checkAllRequestedConstraintsPresent(grid, options) {
    const useHexagons = options.useHexagons ?? true;
    const useSquares = options.useSquares ?? true;
    const useStars = options.useStars ?? true;
    const useTetris = options.useTetris ?? false;
    const useBrokenEdges = options.useBrokenEdges ?? false;
    if (useBrokenEdges) {
      let found = false;
      for (let r = 0; r <= grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          if (grid.hEdges[r][c].type === 1 /* Broken */ || grid.hEdges[r][c].type === 2 /* Absent */) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) {
        for (let r = 0; r < grid.rows; r++) {
          for (let c = 0; c <= grid.cols; c++) {
            if (grid.vEdges[r][c].type === 1 /* Broken */ || grid.vEdges[r][c].type === 2 /* Absent */) {
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }
      if (!found) return false;
    }
    if (useHexagons) {
      let found = false;
      for (let r = 0; r <= grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          if (grid.hEdges[r][c].type === 3 /* Hexagon */) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) {
        for (let r = 0; r < grid.rows; r++) {
          for (let c = 0; c <= grid.cols; c++) {
            if (grid.vEdges[r][c].type === 3 /* Hexagon */) {
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }
      if (!found) return false;
    }
    if (useSquares || useStars || useTetris) {
      let foundSquare = false;
      let foundStar = false;
      let foundTetris = false;
      const squareColors = /* @__PURE__ */ new Set();
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          if (grid.cells[r][c].type === 1 /* Square */) {
            foundSquare = true;
            squareColors.add(grid.cells[r][c].color);
          }
          if (grid.cells[r][c].type === 2 /* Star */) foundStar = true;
          if (grid.cells[r][c].type === 3 /* Tetris */ || grid.cells[r][c].type === 4 /* TetrisRotated */) {
            foundTetris = true;
          }
        }
      }
      if (useSquares && !foundSquare) return false;
      if (useStars && !foundStar) return false;
      if (useTetris && !foundTetris) return false;
      if (foundSquare && !foundStar && squareColors.size < 2) {
        return false;
      }
    }
    if (this.hasIsolatedMark(grid)) return false;
    return true;
  }
  /**
   * 領域を指定されたピース数以内でタイリングする。成功すればピースのリストを返す。
   */
  generateTiling(region, maxPieces, options) {
    const minX = Math.min(...region.map((p) => p.x));
    const minY = Math.min(...region.map((p) => p.y));
    const maxX = Math.max(...region.map((p) => p.x));
    const maxY = Math.max(...region.map((p) => p.y));
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const regionGrid = Array.from({ length: height }, () => Array(width).fill(false));
    for (const p of region) {
      regionGrid[p.y - minY][p.x - minX] = true;
    }
    return this.tilingDfs(regionGrid, [], maxPieces, options);
  }
  tilingDfs(regionGrid, currentPieces, maxPieces, options) {
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
    if (r0 === -1) return currentPieces;
    if (currentPieces.length >= maxPieces) return null;
    const difficulty = options.difficulty ?? 0.5;
    let shapes = [...this.TETRIS_SHAPES];
    this.shuffleArray(shapes);
    if (difficulty > 0.6) {
      shapes.sort((a, b) => {
        const areaA = this.getShapeArea(a);
        const areaB = this.getShapeArea(b);
        if (areaA <= 2 && areaB > 2) return 1;
        if (areaB <= 2 && areaA > 2) return -1;
        return 0;
      });
    }
    for (const baseShape of shapes) {
      const isInvariant = this.isRotationallyInvariant(baseShape);
      const rotations = isInvariant ? [baseShape] : this.getAllRotations(baseShape);
      this.shuffleArray(rotations);
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
            const rotProb = 0.3 + difficulty * 0.6;
            const isRotated = !isInvariant && Math.random() < rotProb;
            const result = this.tilingDfs(regionGrid, [...currentPieces, { shape, displayShape: baseShape, isRotated }], maxPieces, options);
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
    for (const row of shape) {
      for (const cell of row) {
        if (cell) area++;
      }
    }
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
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        newShape[c][rows - 1 - r] = shape[r][c];
      }
    }
    return newShape;
  }
  canPlace(regionGrid, shape, r, c) {
    for (let i = 0; i < shape.length; i++) {
      for (let j = 0; j < shape[0].length; j++) {
        if (shape[i][j]) {
          const nr = r + i;
          const nc = c + j;
          if (nr < 0 || nr >= regionGrid.length || nc < 0 || nc >= regionGrid[0].length || !regionGrid[nr][nc]) {
            return false;
          }
        }
      }
    }
    return true;
  }
  placePiece(regionGrid, shape, r, c, value) {
    for (let i = 0; i < shape.length; i++) {
      for (let j = 0; j < shape[0].length; j++) {
        if (shape[i][j]) {
          regionGrid[r + i][c + j] = value;
        }
      }
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
  PuzzleValidator,
  WitnessCore
};
//# sourceMappingURL=MiniWitness.js.map
