export async function createDummyLabelsFile(imageFile: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageFile);
    
    img.onload = () => {
      const width = img.width;
      const height = img.height;
      URL.revokeObjectURL(url);
      
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        return reject(new Error("Failed to get 2d context for dummy label creation"));
      }

      // Fill with black (e.g. class 0)
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);
      
      canvas.toBlob((blob) => {
        if (!blob) {
          return reject(new Error("Failed to create blob for dummy label"));
        }
        const file = new File([blob], "dummy_labels.png", { type: "image/png" });
        resolve(file);
      }, "image/png");
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image to determine dimensions for dummy labels"));
    };
    
    img.src = url;
  });
}
