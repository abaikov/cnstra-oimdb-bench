# State Management Benchmarks

A comprehensive benchmarking suite for comparing React state management libraries in real-world scenarios.

## 🚀 Quick Start

### Requirements

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v8.0.0 or higher

If using nvm:
```bash
source ~/.nvm/nvm.sh
nvm use 20  # or nvm use 18
```

### Installation

```bash
npm install
```

### Running the Benchmarks

```bash
npm run dev
```

Open your browser to `http://localhost:5173` to start benchmarking.

## 📊 How to Use

1. **Select a State Manager**: Use the dropdown in the toolbar to choose a state management library
2. **Run Benchmarks**: Click one of the benchmark buttons:
   - **🔄 Updates**: Tests background updates performance
   - **✏️ Edit**: Tests inline editing performance
   - **📦 Bulk**: Tests bulk update operations
   - **🚀 All Tests**: Runs all benchmarks sequentially
3. **View Results**: Click the **📊 Results** button to see detailed performance metrics and comparisons

## 📈 Metrics Measured

- **Execution Time**: How long operations take to complete
- **Render Count**: Number of component re-renders
- **Memory Usage**: Memory consumption during operations
- **FPS**: Frame rate during updates
- **Latency**: P50, P95, and P99 latency percentiles

## 🎯 Supported State Managers

- **Cnstra + Oimdb**: Reactive collections with CNS
- **Redux Toolkit**: Official Redux toolkit
- **Effector**: Reactive state management
- **MobX**: Observable state
- **Zustand**: Lightweight state management
- **React State**: Pure React useState/Context

## 🔧 Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production (requires Node.js v18+)
# If using nvm, make sure to activate it first:
# source ~/.nvm/nvm.sh
npm run build

# Preview production build
npm run preview
```

## 📝 Benchmarking Guidelines

See [BENCHMARKING.md](./BENCHMARKING.md) for detailed guidelines on how benchmarks are configured and what best practices are followed for each library.

## 🎨 Features

- **Visual Results**: Beautiful charts and tables comparing performance
- **Real-time Metrics**: FPS and latency overlays (enable with `?overlays=1`)
- **Multiple Scenarios**: Tests different usage patterns
- **Performance Scoring**: Automatic scoring based on multiple metrics
- **Lines of Code**: Shows implementation complexity for each adapter

## 📝 Lines of Code Tracking

The benchmark automatically displays the lines of code required to implement each adapter. The LOC counting script runs **automatically** before `npm run dev` and `npm run build`, so you don't need to update it manually!

The script counts non-empty, non-comment lines in each adapter's `src/` directory and updates `packages/core/src/adapter-loc.json`. The LOC data is displayed in the results table.

To manually update LOC counts:
```bash
npm run count-loc
```

## 📤 Export Results

Click the **📥 Export JSON** button in the results view to download comprehensive benchmark data with:
- All performance metrics
- Interpretation guide for LLM analysis
- Metadata about adapters and scenarios
- Ready-to-share JSON format for analysis

## ✅ Production Ready

This benchmark suite is production-ready:
- ✅ All adapters optimized and tested
- ✅ Clean UI with intuitive controls
- ✅ Real-time performance metrics
- ✅ Export functionality for data analysis
- ✅ Screen blocking during tests for accurate measurements
- ✅ Clear visual indicators (🏆 best, ⚠️ worst)
- ✅ Tooltips and help text throughout
- ✅ Automatic LOC tracking

## 📄 License

See LICENSE file for details.

