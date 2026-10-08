# Backend Requests

This document outlines the required changes to the backend to fully support the DepthWizard frontend.

## 1. Optional Labels
- Currently, the frontend sends a dummy mask if the user does not provide one. The backend should ideally accept jobs without the `labels` file and handle the blank mask logic internally (e.g. treating all pixels as valid).
- The `labels` parameter in `/api/v1/process` should be made optional.

## 2. Georeferencing Transform in Metadata
- The frontend needs the transformation matrix (affine transform) to accurately project pixels to geographic coordinates during validation.
- **Requirement:** Ensure `transform` is included in `metadata.json` for georeferenced results (an array of 6 floats: `[x0, dx, xskew, y0, yskew, dy]`).

## 3. Datum / Height Reference
- The frontend supports displaying the height datum or vertical reference for absolute height maps.
- **Requirement:** Add a `datum` or `height_reference` string field to `metadata.json` (e.g., `"EGM96"`, `"WGS84 ellipsoid"`, `"Local"`).

## 4. Calibration Stats Format
- The frontend uses `metadata.classes` for calibration statistics.
- Please ensure that for each class, the object conforms to:
  ```json
  {
    "rmse": number,
    "n_ref": number,
    "scale": number,
    "shift": number
  }
  ```

## 5. Confidence Maps
- To enable stratified validation by confidence, the backend should return a `confidence` map (e.g., 8-bit PNG) and include its path in `metadata.files.confidence`.
- Ensure `mean_confidence` is provided in the metadata.

## 6. EXIF Rotation Handling
- The frontend warns users if the input image dimensions mismatch the output dimensions (which often happens when the backend ignores EXIF rotation flags).
- **Requirement:** The backend should read and apply EXIF orientation tags before processing the image, so the output dimensions match the original (rotated) dimensions.
