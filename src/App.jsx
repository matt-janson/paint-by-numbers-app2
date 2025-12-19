import React, { useState, useRef, useEffect } from 'react';
import { Upload, ZoomIn, ZoomOut, RotateCcw, Eye, EyeOff, Palette, ArrowLeft, Grid, Trash2, Plus, Lock, Unlock } from 'lucide-react';

const ADMIN_CODE = "PAINT2024"; // Change this to your own secret code

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminPrompt, setShowAdminPrompt] = useState(false);
  const [adminInput, setAdminInput] = useState('');
  const [clickCount, setClickCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const clickTimerRef = useRef(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const keys = await window.storage.list('project:', true);
      if (keys && keys.keys) {
        const loadedProjects = [];
        for (const key of keys.keys) {
          try {
            const result = await window.storage.get(key, true);
            if (result && result.value) {
              const project = JSON.parse(result.value);
              loadedProjects.push(project);
            }
          } catch (e) {
            console.error('Error loading project:', key, e);
          }
        }
        setProjects(loadedProjects.sort((a, b) => b.createdAt - a.createdAt));
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
    setLoading(false);
  };

  const saveProject = async (project) => {
    try {
      await window.storage.set(`project:${project.id}`, JSON.stringify(project), true);
      await loadProjects();
    } catch (error) {
      console.error('Error saving project:', error);
      alert('Error saving project. Please try again.');
    }
  };

  const deleteProject = async (projectId) => {
    if (!isAdmin) {
      alert('Admin access required');
      return;
    }
    
    if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) {
      return;
    }
    
    try {
      await window.storage.delete(`project:${projectId}`, true);
      await loadProjects();
      if (currentProject && currentProject.id === projectId) {
        setCurrentProject(null);
        setView('gallery');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Error deleting project. Please try again.');
    }
  };

  const handleTitleClick = () => {
    setClickCount(prev => prev + 1);
    
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }
    
    if (clickCount + 1 >= 5) {
      setShowAdminPrompt(true);
      setClickCount(0);
    } else {
      clickTimerRef.current = setTimeout(() => {
        setClickCount(0);
      }, 2000);
    }
  };

  const handleAdminLogin = () => {
    if (adminInput === ADMIN_CODE) {
      setIsAdmin(true);
      setShowAdminPrompt(false);
      setAdminInput('');
      alert('Admin mode activated! You can now upload and delete projects.');
    } else {
      alert('Incorrect code');
      setAdminInput('');
    }
  };

  const handleImageUpload = (e) => {
    if (!isAdmin) {
      alert('Admin access required to upload images');
      return;
    }
    
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

  const processNewImage = async (img, dataUrl) => {
    setProcessing(true);
    
    setTimeout(async () => {
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
        userProgress: {}
      };
      
      await saveProject(project);
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
    if (!canvas || !currentProject) {
      console.log('Canvas ref or project missing');
      return;
    }
    
    console.log('Drawing canvas:', currentProject.width, 'x', currentProject.height);
    
    canvas.width = currentProject.width;
    canvas.height = currentProject.height;
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.onload = () => {
      console.log('Image loaded successfully');
      ctx.drawImage(img, 0, 0, currentProject.width, currentProject.height);
    };
    img.onerror = (e) => {
      console.error('Image failed to load:', e);
      alert('Failed to load project image. The image data may be corrupted.');
    };
    img.src = currentProject.imageUrl;
  };

  const getUserId = () => {
    let userId = localStorage.getItem('paintByNumbersUserId');
    if (!userId) {
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('paintByNumbersUserId', userId);
    }
    return userId;
  };

  const drawOverlay = () => {
    const canvas = overlayCanvasRef.current;
    const baseCanvas = canvasRef.current;
    if (!canvas || !baseCanvas || !currentProject) return;
    
    canvas.width = baseCanvas.width;
    canvas.height = baseCanvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const userId = getUserId();
    const userPaintedRegions = currentProject.userProgress?.[userId] || [];
    const paintedSet = new Set(userPaintedRegions);
    
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

  const handleCanvasClick = async (e) => {
    if (!selectedColor || isDragging || !currentProject) return;
    
    const canvas = overlayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left - pan.x) / zoom);
    const y = Math.floor((e.clientY - rect.top - pan.y) / zoom);
    
    const region = currentProject.regions.find(r => 
      r.pixels.some(([px, py]) => px === x && py === y)
    );
    
    const userId = getUserId();
    const userPaintedRegions = currentProject.userProgress?.[userId] || [];
    
    if (region && region.colorId === selectedColor && !userPaintedRegions.includes(region.id)) {
      const updatedProject = {
        ...currentProject,
        userProgress: {
          ...currentProject.userProgress,
          [userId]: [...userPaintedRegions, region.id]
        }
      };
      setCurrentProject(updatedProject);
      await saveProject(updatedProject);
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
    console.log('Opening project:', project.id);
    console.log('Project has image:', !!project.imageUrl);
    console.log('Project regions:', project.regions?.length);
    console.log('Project colors:', project.colors?.length);
    
    if (!project.imageUrl || !project.regions || !project.colors) {
      alert('This project has corrupted data. Please delete and recreate it.');
      return;
    }
    
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
      <div className="w-full min-h-screen bg-gray-900 text-white overflow-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 
              className="text-3xl font-bold cursor-pointer select-none"
              onClick={handleTitleClick}
            >
              Paint by Numbers Gallery
            </h1>
            {isAdmin && (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-600 rounded-lg">
                <Unlock size={20} />
                <span className="font-semibold">Admin Mode</span>
              </div>
            )}
          </div>
          
          {isAdmin && (
            <div className="mb-6">
              <label className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer inline-flex items-center gap-2 text-lg">
                <Plus size={24} />
                Create New Project
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
              <div className="mt-4 flex items-center gap-2">
                <label className="text-sm">Colors for new projects:</label>
                <input 
                  type="number" 
                  min="50" 
                  max="500" 
                  value={numColors}
                  onChange={(e) => setNumColors(parseInt(e.target.value))}
                  className="w-24 px-3 py-2 bg-gray-800 rounded"
                />
              </div>
            </div>
          )}

          {showAdminPrompt && (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
              <div className="bg-gray-800 p-8 rounded-lg max-w-md w-full">
                <div className="flex items-center gap-3 mb-4">
                  <Lock size={32} className="text-yellow-500" />
                  <h2 className="text-2xl font-bold">Admin Access</h2>
                </div>
                <p className="text-gray-300 mb-4">Enter admin code to unlock upload features:</p>
                <input
                  type="password"
                  value={adminInput}
                  onChange={(e) => setAdminInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                  className="w-full px-4 py-2 bg-gray-700 rounded mb-4"
                  placeholder="Enter code"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAdminLogin}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                  >
                    Unlock
                  </button>
                  <button
                    onClick={() => {
                      setShowAdminPrompt(false);
                      setAdminInput('');
                    }}
                    className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {processing && (
            <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-75 z-50">
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
                <div className="text-xl">Processing image with {numColors} colors...</div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-20">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-xl text-gray-400">Loading projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <Grid size={64} className="mx-auto mb-4 opacity-50" />
              <p className="text-xl">No projects available yet.</p>
              {!isAdmin && (
                <p className="text-sm mt-2 text-gray-600">Check back soon for new paint by numbers!</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map(project => {
                const userId = getUserId();
                const userPaintedRegions = project.userProgress?.[userId] || [];
                const progress = project.regions.length > 0 
                  ? (userPaintedRegions.length / project.regions.length * 100).toFixed(1)
                  : 0;
                
                return (
                  <div key={project.id} className="bg-gray-800 rounded-lg overflow-hidden hover:ring-2 ring-blue-500 transition-all">
                    <div 
                      className="cursor-pointer"
                      onClick={() => openProject(project)}
                    >
                      <img 
                        src={project.imageUrl} 
                        alt={project.name}
                        className="w-full h-48 object-cover"
                      />
                      <div className="p-4">
                        <h3 className="font-bold text-lg mb-2">{project.name}</h3>
                        <div className="text-sm text-gray-400 space-y-1">
                          <div>Colors: {project.numColors}</div>
                          <div>Regions: {project.regions.length}</div>
                          <div>Your Progress: {progress}%</div>
                          <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="px-4 pb-4">
                        <button
                          onClick={() => deleteProject(project.id)}
                          className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded flex items-center justify-center gap-2"
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const userId = getUserId();
  const userPaintedRegions = currentProject?.userProgress?.[userId] || [];
  const progress = currentProject && currentProject.regions.length > 0 
    ? (userPaintedRegions.length / currentProject.regions.length * 100).toFixed(1)
    : 0;

  if (!currentProject) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <div>Loading project...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900 text-white">
      <div className="p-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4 mb-4">
          <button 
            onClick={backToGallery}
            className="p-2 hover:bg-gray-700 rounded flex items-center gap-2"
          >
            <ArrowLeft size={20} />
            Back to Gallery
          </button>
          <h1 className="text-2xl font-bold">{currentProject?.name}</h1>
          {isAdmin && (
            <div className="ml-auto flex items-center gap-2 px-3 py-1 bg-green-600 rounded text-sm">
              <Unlock size={16} />
              Admin
            </div>
          )}
        </div>
        
        <div className="flex flex-wrap gap-4 items-center">
          <button 
            onClick={() => setZoom(z => Math.min(z + 0.5, 5))}
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded"
          >
            <ZoomIn size={20} />
          </button>
          <button 
            onClick={() => setZoom(z => Math.max(z - 0.5, 0.5))}
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded"
          >
            <ZoomOut size={20} />
          </button>
          <button 
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded"
          >
            <RotateCcw size={20} />
          </button>
          <button 
            onClick={() => setShowNumbers(!showNumbers)}
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded"
          >
            {showNumbers ? <Eye size={20} /> : <EyeOff size={20} />}
          </button>
          <div className="text-sm">
            Your Progress: {progress}% ({userPaintedRegions.length}/{currentProject?.regions.length} regions)
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative overflow-hidden bg-gray-800">
          <div 
            className="absolute inset-0 overflow-hidden"
            style={{ cursor: isDragging ? 'grabbing' : 'crosshair' }}
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
              <canvas ref={canvasRef} className="absolute" />
              <canvas 
                ref={overlayCanvasRef} 
                className="absolute"
                onClick={handleCanvasClick}
                style={{ cursor: selectedColor ? 'crosshair' : 'default' }}
              />
            </div>
          </div>
        </div>

        {currentProject && (
          <div className="w-80 bg-gray-800 border-l border-gray-700 overflow-y-auto p-4">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Palette size={20} />
              Color Palette
            </h2>
            <div className="space-y-2">
              {currentProject.colors.map(color => {
                const regionCount = currentProject.regions.filter(r => r.colorId === color.id).length;
                const paintedCount = currentProject.regions.filter(r => 
                  r.colorId === color.id && userPaintedRegions.includes(r.id)
                ).length;
                
                return (
                  <div 
                    key={color.id}
                    onClick={() => setSelectedColor(color.id)}
                    className={`p-3 rounded cursor-pointer transition-all ${
                      selectedColor === color.id 
                        ? 'ring-2 ring-blue-500 bg-gray-700' 
                        : 'bg-gray-700 hover:bg-gray-600'
                    } ${paintedCount === regionCount ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-12 h-12 rounded border-2 border-gray-600"
                        style={{ backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})` }}
                      />
                      <div className="flex-1">
                        <div className="font-bold">#{color.id}</div>
                        <div className="text-xs text-gray-400">
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
      
      <div className="p-2 bg-gray-800 border-t border-gray-700 text-xs text-gray-400 text-center">
        Tip: Click a color in the palette, then click regions with that number. Hold Shift + drag to pan.
      </div>
    </div>
  );
};

export default PaintByNumbers;
