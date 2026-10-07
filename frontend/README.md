# DepthWizard Frontend

A desktop Electron application for 3D terrain visualization, predicting heightmaps, and analyzing prediction accuracy against reference LiDAR GeoTIFFs.

## Features

- **Backend Integration**: Communicates via IPC from the Electron Renderer to the Main process, ensuring secure and CORS-free requests to the DepthWizard API. Configure the backend URL in the Settings Dialog.
- **Offline CRS/Georeferencing**: Bundled with a local coordinate reference system dictionary containing all UTM zones (EPSG:326xx, 327xx) and common CRSes (4326, 3857) allowing completely offline geospatial alignment without external API calls.
- **Validation**: Upload a reference GeoTIFF, reproject/resample it against the predicted surface, and compare accuracy (RMSE, MAE, pixel counts) dynamically by regions and confidence thresholds.
- **Tools**: Includes measuring tools, bookmarks, auto-tour camera features, slope overlays, profile charting, and 2D swipe comparison for predictions versus ground truth.
- **Exporting**: Export screenshots, OBJ mesh data, and original calibrated GeoTIFF prediction results directly from the backend.

## Development

```bash
# Install dependencies
npm install

# Run Vite dev server
npm run dev

# Run Electron app in dev mode
npm run electron:start
```

## Packaging for Production

This project uses `electron-builder` to package the app.

```bash
# Compile TS, bundle via Vite, and package into an AppImage / executable
npm run electron:build
```

The resulting executables will be generated in `dist-electron/`.

## Manual Verification (Packaged Binary)

You can find the packaged binary for Linux as an `.AppImage` in the `dist-electron/` folder. Run it directly to verify offline functionality, backend connectivity, settings persistence, and metrics computation.
