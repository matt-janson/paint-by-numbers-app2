import React, { useState, useRef, useEffect } from 'react';
import { Upload, ZoomIn, ZoomOut, RotateCcw, Eye, EyeOff, Palette, ArrowLeft, Grid, Trash2, Plus } from 'lucide-react';

const PaintByNumbers = () => {
  const [view, setView] = useState('gallery');
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [selectedColor, setSelectedColor] = useState(null);
  const [showNumbers, setShowNumbers] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [numColors, setNumColors] = useState(400);
  
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = () => {
    try {
      const saved = localStorage.getItem('paintByNumbersProjects');
      if (saved) {
        setProjects(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const saveProjects = (updatedProjects) => {
    try {
      localStorage.setItem('paintByNumbersProjects', JSON.stringify(updatedProjects));
      setProjects(updatedProjects);
    } catch (error) {
      console.error('Error saving projects:', error);
    }
  };

  const deleteProject = (projectId) => {
    const updated = projects.filter(p => p.id !== projectId);
    saveProjects(updated);
    if (currentProject && currentProject.id === projectId) {
      setCurrentProject(null);
      setView('gallery');
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          processNewImage(img, event.target.result);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const processNewImage = (img, dataUrl) => {
    setProcessing(true);
    
    setTimeout(() => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const maxDim = 800;
      let width = img.width;
      let height = img.height;
      
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = (height / width) * maxDim;
          width = maxDim;
        } else {
          width = (width / height) * maxDim;
          height = maxDim;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      const imageData = ctx.getImageData(0, 0, width, height);
      const quantized = quantizeImage(imageData, numColors);
      const foundRegions = findRegions(quantized, width, height);
      
      const project = {
        id: Date.now().toString(),
        name: `Project ${projects.length + 1}`,
        createdAt: Date.now(),
        imageUrl: dataUrl,
        width,
        height,
        numColors,
        regions: foundRegions,
        colors: quantized.palette,
        paintedRegions: []
      };
      
      const updatedProjects = [project, ...projects];
      saveProjects(updatedProjects);
      setCurrentProject(project);
      setView('canvas');
      setProcessing(false);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }, 100);
  };

  const quantizeImage = (imageData, k) => {
    const pixels = [];
    for (let i = 0; i < imageData.data.length; i += 4) {
      pixels.push([
        imageData.data[i],
        imageData.data[i + 1],
        imageData.data[i + 2]
      ]);
    }
    
    const centroids = kMeansClustering(pixels, k);
    const palette = centroids.map((c, i) => ({
      id: i + 1,
      r: Math.round(c[0]),
      g: Math.round(c[1]),
      b: Math.round(c[2])
    }));
    
    const assignments = new Uint16Array(pixels.length);
    for (let i = 0; i < pixels.length; i++) {
      let minDist = Infinity;
      let closest = 0;
      for (let j = 0; j < centroids.length; j++) {
        const dist = colorDistance(pixels[i], centroids[j]);
        if (dist < minDist) {
          minDist = dist;
          closest = j;
        }
      }
      assignments[i] = closest;
    }
    
    return { assignments, palette, width: imageData.width, height: imageData.height };
  };

  const kMeansClustering = (pixels, k, maxIter = 10) => {
    const centroids = [];
    const step = Math.floor(pixels.length / k);
    for (let i = 0; i < k; i++) {
      centroids.push([...pixels[i * step]]);
    }
    
    for (let iter = 0; iter < maxIter; iter++) {
      const clusters = Array(k).fill().map(() => []);
      
      for (let i = 0; i < pixels.length; i++) {
        let minDist = Infinity;
        let closest = 0;
        for (let j = 0; j < k; j++) {
          const dist = colorDistance(pixels[i], centroids[j]);
          if (dist < minDist) {
            minDist = dist;
            closest = j;
          }
        }
        clusters[closest].push(pixels[i]);
      }
      
      for (let j = 0; j < k; j++) {
        if (clusters[j].length > 0) {
          centroids[j] = [
            clusters[j].reduce((sum, p) => sum + p[0], 0) / clusters[j].length,
            clusters[j].reduce((sum, p) => sum + p[1], 0) / clusters[j].length,
            clusters[j].reduce((sum, p) => sum + p[2], 0) / clusters[j].length
          ];
        }
      }
    }
    
    return centroids;
  };

  const colorDistance = (c1, c2) => {
    return Math.sqrt(
      Math.pow(c1[0] - c2[0], 2) +
      Math.pow(c1[1] - c2[1], 2) +
      Math.pow(c1[2] - c2[2], 2)
    );
  };

  const findRegions = (quantized, width, height) => {
    const visited = new Set();
    const foundRegions = [];
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!visited.has(idx)) {
          const colorId = quantized.assignments[idx];
          const region = floodFill(x, y, colorId, quantized.assignments, width, height, visited);
          if (region.pixels.length > 5) {
            foundRegions.push({
              id: foundRegions.length,
              colorId: colorId + 1,
              pixels: region.pixels,
              center: region.center
            });
          }
        }
      }
    }
    
    return foundRegions;
  };

  const floodFill = (startX, startY, targetColor, assignments, width, height, visited) => {
    const stack = [[startX, startY]];
    const pixels = [];
    let sumX = 0, sumY = 0;
    
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const idx = y * width + x;
      
      if (x < 0 || x >= width || y < 0 || y >= height || visited.has(idx)) continue;
      if (assignments[idx] !== targetColor) continue;
      
      visited.add(idx);
      pixels.push([x, y]);
      sumX += x;
      sumY += y;
      
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    
    return {
      pixels,
      center: pixels.length > 0 ? { x: sumX / pixels.length, y: sumY / pixels.length } : { x: startX, y: startY }
    };
  };

  useEffect(() => {
    if (currentProject && view === 'canvas') {
      drawCanvas();
      drawOverlay();
    }
  }, [currentProject, showNumbers, zoom, pan, view]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !currentProject) return;
    
    canvas.width = currentProject.width;
    canvas.height = currentProject.height;
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, currentProject.width, currentProject.height);
    };
    img.src = currentProject.imageUrl;
  };

  const drawOverlay = () => {
    const canvas = overlayCanvasRef.current;
    const baseCanvas = canvasRef.current;
    if (!canvas || !baseCanvas || !currentProject) return;
    
    canvas.width = baseCanvas.width;
    canvas.height = baseCanvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const paintedSet = new Set(currentProject.paintedRegions);
    
    currentProject.regions.forEach(region => {
      const isPainted = paintedSet.has(region.id);
      const color = currentProject.colors.find(c => c.id === region.colorId);
      
      if (!isPainted && color) {
        ctx.fillStyle = `rgba(255, 255, 255, 0.8)`;
        region.pixels.forEach(([x, y]) => {
          ctx.fillRect(x, y, 1, 1);
        });
      }
      
      if (showNumbers && !isPainted && region.pixels.length > 30) {
        ctx.fillStyle = 'black';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const text = region.colorId.toString();
        ctx.strokeText(text, region.center.x, region.center.y);
        ctx.fillText(text, region.center.x, region.center.y);
      }
    });
    
    currentProject.regions.forEach(region => {
      region.pixels.forEach(([x, y]) => {
        const neighbors = [[x+1,y], [x-1,y], [x,y+1], [x,y-1]];
        neighbors.forEach(([nx, ny]) => {
          if (nx >= 0 && nx < canvas.width && ny >= 0 && ny < canvas.height) {
            const neighborRegion = currentProject.regions.find(r => 
              r.pixels.some(([px, py]) => px === nx && py === ny)
            );
            if (neighborRegion && neighborRegion.id !== region.id) {
              ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
              ctx.fillRect(x, y, 1, 1);
            }
          }
        });
      });
    });
  };

  const handleCanvasClick = (e) => {
    if (!selectedColor || isDragging || !currentProject) return;
    
    const canvas = overlayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left - pan.x) / zoom);
    const y = Math.floor((e.clientY - rect.top - pan.y) / zoom);
    
    const region = currentProject.regions.find(r => 
      r.pixels.some(([px, py]) => px === x && py === y)
    );
    
    if (region && region.colorId === selectedColor && !currentProject.paintedRegions.includes(region.id)) {
      const updatedProject = {
        ...currentProject,
        paintedRegions: [...currentProject.paintedRegions, region.id]
      };
      setCurrentProject(updatedProject);
      
      const updatedProjects = projects.map(p => 
        p.id === updatedProject.id ? updatedProject : p
      );
      saveProjects(updatedProjects);
    }
  };

  const handleMouseDown = (e) => {
    if (e.button === 0 && !e.shiftKey) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const openProject = (project) => {
    setCurrentProject(project);
    setView('canvas');
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedColor(null);
  };

  const backToGallery = () => {
    setView('gallery');
    setCurrentProject(null);
    setSelectedColor(null);
  };

  if (view === 'gallery') {
    return (
      <div style={{ width: '100%', minHeight: '100vh', backgroundColor: '#111827', color: 'white', overflow: 'auto' }}>
        <div style={{ padding: '1.5rem' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>My Paint by Numbers Gallery</h1>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ 
              padding: '0.75rem 1.5rem', 
              backgroundColor: '#2563eb', 
              borderRadius: '0.5rem', 
              cursor: 'pointer', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              fontSize: '1.125rem'
            }}>
              <Plus size={24} />
              Create New Project
              <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
            </label>
            <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.875rem' }}>Colors for new projects:</label>
              <input 
                type="number" 
                min="50" 
                max="500" 
                value={numColors}
                onChange={(e) => setNumColors(parseInt(e.target.value))}
                style={{ 
                  width: '6rem', 
                  padding: '0.5rem', 
                  backgroundColor: '#1f2937', 
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem'
                }}
              />
            </div>
          </div>

          {processing && (
            <div style={{ 
              position: 'fixed', 
              inset: 0, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              backgroundColor: 'rgba(0,0,0,0.75)', 
              zIndex: 50 
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ 
                  width: '4rem', 
                  height: '4rem', 
                  border: '2px solid white', 
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 1rem'
                }}></div>
                <div style={{ fontSize: '1.25rem' }}>Processing image with {numColors} colors...</div>
              </div>
            </div>
          )}

          {projects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '5rem 0', color: '#6b7280' }}>
              <Grid size={64} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
              <p style={{ fontSize: '1.25rem' }}>No projects yet. Upload a photo to get started!</p>
            </div>
          ) : (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
              gap: '1.5rem' 
            }}>
              {projects.map(project => {
                const progress = project.regions.length > 0 
                  ? (project.paintedRegions.length / project.regions.length * 100).toFixed(1)
                  : 0;
                
                return (
                  <div key={project.id} style={{ 
                    backgroundColor: '#1f2937', 
                    borderRadius: '0.5rem', 
                    overflow: 'hidden',
                    transition: 'all 0.2s'
                  }}>
                    <div 
                      style={{ cursor: 'pointer' }}
                      onClick={() => openProject(project)}
                    >
                      <img 
                        src={project.imageUrl} 
                        alt={project.name}
                        style={{ width: '100%', height: '12rem', objectFit: 'cover' }}
                      />
                      <div style={{ padding: '1rem' }}>
                        <h3 style={{ fontWeight: 'bold', fontSize: '1.125rem', marginBottom: '0.5rem' }}>{project.name}</h3>
                        <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                          <div>Colors: {project.numColors}</div>
                          <div>Regions: {project.regions.length}</div>
                          <div>Progress: {progress}%</div>
                          <div style={{ 
                            width: '100%', 
                            backgroundColor: '#374151', 
                            borderRadius: '9999px', 
                            height: '0.5rem', 
                            marginTop: '0.5rem' 
                          }}>
                            <div 
                              style={{ 
                                backgroundColor: '#2563eb', 
                                height: '0.5rem', 
                                borderRadius: '9999px',
                                width: `${progress}%`,
                                transition: 'width 0.3s'
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: '0 1rem 1rem' }}>
                      <button
                        onClick={() => deleteProject(project.id)}
                        style={{
                          width: '100%',
                          padding: '0.5rem 1rem',
                          backgroundColor: '#dc2626',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  const progress = currentProject && currentProject.regions.length > 0 
    ? (currentProject.paintedRegions.length / currentProject.regions.length * 100).toFixed(1)
    : 0;

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#111827', color: 'white' }}>
      <div style={{ padding: '1rem', backgroundColor: '#1f2937', borderBottom: '1px solid #374151' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <button 
            onClick={backToGallery}
            style={{ 
              padding: '0.5rem', 
              backgroundColor: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              borderRadius: '0.25rem'
            }}
          >
            <ArrowLeft size={20} />
            Back to Gallery
          </button>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{currentProject?.name}</h1>
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <button 
            onClick={() => setZoom(z => Math.min(z + 0.5, 5))}
            style={{ padding: '0.5rem', backgroundColor: '#374151', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', color: 'white' }}
          >
            <ZoomIn size={20} />
          </button>
          <button 
            onClick={() => setZoom(z => Math.max(z - 0.5, 0.5))}
            style={{ padding: '0.5rem', backgroundColor: '#374151', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', color: 'white' }}
          >
            <ZoomOut size={20} />
          </button>
          <button 
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            style={{ padding: '0.5rem', backgroundColor: '#374151', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', color: 'white' }}
          >
            <RotateCcw size={20} />
          </button>
          <button 
            onClick={() => setShowNumbers(!showNumbers)}
            style={{ padding: '0.5rem', backgroundColor: '#374151', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', color: 'white' }}
          >
            {showNumbers ? <Eye size={20} /> : <EyeOff size={20} />}
          </button>
          <div style={{ fontSize: '0.875rem' }}>
            Progress: {progress}% ({currentProject?.paintedRegions.length}/{currentProject?.regions.length} regions)
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#1f2937' }}>
          <div 
            style={{ 
              position: 'absolute', 
              inset: 0, 
              overflow: 'hidden',
              cursor: isDragging ? 'grabbing' : 'crosshair'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div style={{ 
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              position: 'relative'
            }}>
              <canvas ref={canvasRef} style={{ position: 'absolute' }} />
              <canvas 
                ref={overlayCanvasRef} 
                style={{ position: 'absolute', cursor: selectedColor ? 'crosshair' : 'default' }}
                onClick={handleCanvasClick}
              />
            </div>
          </div>
        </div>

        {currentProject && (
          <div style={{ width: '20rem', backgroundColor: '#1f2937', borderLeft: '1px solid #374151', overflowY: 'auto', padding: '1rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Palette size={20} />
              Color Palette
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {currentProject.colors.map(color => {
                const regionCount = currentProject.regions.filter(r => r.colorId === color.id).length;
                const paintedCount = currentProject.regions.filter(r => 
                  r.colorId === color.id && currentProject.paintedRegions.includes(r.id)
                ).length;
                
                return (
                  <div 
                    key={color.id}
                    onClick={() => setSelectedColor(color.id)}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      backgroundColor: '#374151',
                      border: selectedColor === color.id ? '2px solid #2563eb' : 'none',
                      opacity: paintedCount === regionCount ? 0.5 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div 
                        style={{ 
                          width: '3rem', 
                          height: '3rem', 
                          borderRadius: '0.25rem',
                          border: '2px solid #4b5563',
                          backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})`
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold' }}>#{color.id}</div>
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                          {paintedCount}/{regionCount} regions
                          {paintedCount === regionCount && ' ✓'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      
      <div style={{ padding: '0.5rem', backgroundColor: '#1f2937', borderTop: '1px solid #374151', fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center' }}>
        Tip: Click a color in the palette, then click regions with that number. Hold Shift + drag to pan.
      </div>
    </div>
  );
};

export default PaintByNumbers;
