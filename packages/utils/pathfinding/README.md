# @polywar/pathfinding

Generic search, no game logic (candidate to move into papit, which has none).

- `Heap`: binary min heap on typed arrays.
- `Search` / `astar({ size, start, goal, neighbours(state, push), heuristic?, limit? })`: A* over any state space; `push(to, cost, tag?)`, tags (move kinds) come back on the path. A `Search` reuses its arrays between runs.
- `GridSearch.find({ n, headings: 8 | 16, from, to, cost(from, to, heading, previous, turn), extra?(node, heading, push), minCost?, greed?, penalty?, limit? })`: (node, heading) states so turns can cost; `extra` adds long moves (bridges, tunnels); `greed` > 1 = weighted A* (faster, a bit worse).
- `alternatives(gridOptions, { k, penalty, spread, overlap, tries })`: k different routes A → B (penalty method), best first.

View: `views/experiment` (noise grid, walls, click A then B).
