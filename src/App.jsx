import React, { useState, useRef } from 'react';
import LoginScreen from './LoginScreen';
import { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import FilePreviewPage from './FilePreviewPage';
import ChatWidget from './ChatWidget';
import { 
  Folder, 
  FileText, 
  ChevronRight, 
  ArrowLeft, 
  Plus, 
  Search, 
  UploadCloud, 
  X, 
  Trash2, 
  FolderPlus, 
  FilePlus, 
  AlertTriangle 
} from 'lucide-react';
import './App.css';

const initialFileSystem = {
  id: 'root',
  name: 'Home',
  type: 'folder',
  children: [
    {
      id: 'folder-1',
      name: 'Research Papers',
      type: 'folder',
      children: [
        { id: 'file-1', name: 'Attention_Is_All_You_Need.pdf', type: 'file', size: '2.4 MB', content: 'PDF paper on transformer architectures.' },
        { id: 'file-2', name: 'RAG_Original_Paper.pdf', type: 'file', size: '1.8 MB', content: 'Retrieval Augmented Generation paper.' },
        { 
          id: 'subfolder-1', 
          name: 'Datasets', 
          type: 'folder', 
          children: [
            { id: 'file-5', name: 'wiki_data.csv', type: 'file', size: '14.2 MB', content: 'Wikipedia embeddings dataset.' }
          ]
        }
      ]
    },
    {
      id: 'folder-2',
      name: 'Personal Notes',
      type: 'folder',
      children: [
        { id: 'file-3', name: 'Project_Ideas.txt', type: 'file', size: '12 KB', content: 'List of app ideas and features to build.' },
        { id: 'file-4', name: 'Meeting_Minutes.txt', type: 'file', size: '8 KB', content: 'Discussion notes from weekly sync.' }
      ]
    }
  ]
};

export default function App() {
  const [fileSystem, setFileSystem] = useState(initialFileSystem);
  const [token, setToken] = useState(null);
  const [pathStack, setPathStack] = useState(['root']);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals state
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [filesByFolder, setFilesByFolder] = useState({});
  
  const [previewFile, setPreviewFile] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [dropErrorMessage, setDropErrorMessage] = useState('');

  const [folders, setFolders] = useState([]);

  const fetchFolders = () => {
  fetch('http://127.0.0.1:8000/folders', {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => res.json())
    .then((data) => setFolders(data));
};

useEffect(() => {
  if (!token) return;
  fetchFolders();
}, [token]);



useEffect(() => {
  setFileSystem((prev) => ({
    ...prev,
    children: folders.map((folder) => ({
      id: folder.id,
      name: folder.title,
      type: 'folder',
      children: [],
    })),
  }));
}, [folders]);

  const fileInputRef = useRef(null);

  // Helper: Traverse to active folder based on pathStack
  const getCurrentFolder = (fs, stack) => {
    let current = fs;
    for (let i = 1; i < stack.length; i++) {
      const targetId = stack[i];
      if (current.children) {
        const found = current.children.find(child => child.id === targetId && child.type === 'folder');
        if (found) current = found;
      }
    }
    return current;
  };

  // Helper: Get path breadcrumbs
  const getBreadcrumbs = (fs, stack) => {
    const crumbs = [];
    let current = fs;
    crumbs.push(current);
    for (let i = 1; i < stack.length; i++) {
      const targetId = stack[i];
      if (current.children) {
        const found = current.children.find(child => child.id === targetId && child.type === 'folder');
        if (found) {
          crumbs.push(found);
          current = found;
        }
      }
    }
    return crumbs;
  };

  const currentFolder = getCurrentFolder(fileSystem, pathStack);
  const breadcrumbs = getBreadcrumbs(fileSystem, pathStack);
  const isAtRoot = pathStack.length === 1;

  // Root folder list for sidebar navigation
  const rootFolders = (fileSystem.children || []).filter(item => item.type === 'folder');

  // Navigation actions
  const handleGoBack = () => {
    if (pathStack.length > 1) {
      setPathStack(pathStack.slice(0, -1));
      setSelectedItemId(null);
    }
  };

  const handleOpenFolder = (folderId) => {
  setPathStack([...pathStack, folderId]);
  setSelectedItemId(null);
  setSearchQuery('');
  fetchFiles(folderId);
};

const fetchFiles = (folderId) => {
  fetch(`http://127.0.0.1:8000/folders/${folderId}/files`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => res.json())
    .then((data) => {
      setFilesByFolder((prev) => ({ ...prev, [folderId]: data }));
    });
};




  const handleBreadcrumbClick = (index) => {
    setPathStack(pathStack.slice(0, index + 1));
    setSelectedItemId(null);
  };

  /**
   * Robust state updater that navigates down pathStack and mutates active target folder
   */
  const updateActiveFolder = (updateFn) => {
    const traverse = (node, depth) => {
      if (depth === pathStack.length - 1) {
        return updateFn(node);
      }
      const nextFolderId = pathStack[depth + 1];
      return {
        ...node,
        children: (node.children || []).map(child => {
          if (child.id === nextFolderId && child.type === 'folder') {
            return traverse(child, depth + 1);
          }
          return child;
        })
      };
    };
    setFileSystem(prev => traverse(prev, 0));
  };

  // Action: Create folder (allowed at root level)
  const handleCreateFolder = (e) => {
  e.preventDefault();
  if (!newFolderName.trim()) return;

  fetch('http://127.0.0.1:8000/folders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title: newFolderName.trim() }),
  }).then(() => {
    fetchFolders();
    setNewFolderName('');
    setIsFolderModalOpen(false);
  });
};

  // Action: Create file (ONLY INSIDE A FOLDER)
  const handleCreateFile = (e) => {
    e.preventDefault();
    if (isAtRoot) {
      alert('Files cannot be created outside of a folder. Please open a folder first.');
      return;
    }

    if (!newFileName.trim()) return;
    let finalName = newFileName.trim();
    if (!finalName.includes('.')) finalName += '.txt';

    const newFileObj = {
      id: `file-${Date.now()}`,
      name: finalName,
      type: 'file',
      size: `${Math.max(1, Math.round(newFileContent.length / 1024))} KB`,
      content: newFileContent || 'File content.'
    };

    updateActiveFolder(folder => ({
      ...folder,
      children: [...(folder.children || []), newFileObj]
    }));

    setNewFileName('');
    setNewFileContent('');
    setIsFileModalOpen(false);
  };

  // Action: Delete item (file or folder)
 const handleDeleteItem = (e, item) => {
  if (e) e.stopPropagation();

  if (item.type === 'folder') {
    fetch(`http://127.0.0.1:8000/folders/${item.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).then(() => {
      fetchFolders();
    });
  } else {
    const realFileId = String(item.id).replace('file-', '');
    const folderId = pathStack[pathStack.length - 1];

    fetch(`http://127.0.0.1:8000/files/${realFileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).then(() => {
      fetchFiles(folderId);
    });
  }

  if (selectedItemId === item.id) setSelectedItemId(null);
  if (previewFile?.id === item.id) setPreviewFile(null);
};

  // Drag and Drop
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (isAtRoot) {
      setDropErrorMessage('A file cannot exist outside a folder! Please open a folder first to add files.');
      setTimeout(() => setDropErrorMessage(''), 5000);
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      files.forEach(file => {
        const newFileObj = {
          id: `file-${Date.now()}-${Math.random()}`,
          name: file.name,
          type: 'file',
          size: `${(file.size / 1024).toFixed(1)} KB`,
          content: `Content from ${file.name}`
        };
        updateActiveFolder(folder => ({
          ...folder,
          children: [...(folder.children || []), newFileObj]
        }));
      });
    }
  };

  // Browse local computer file upload -> automatically closes modal box on selection!
  const handleNativeFileUpload = (e) => {
  if (isAtRoot) {
    alert('A file cannot exist outside a folder! Please open a folder first.');
    return;
  }

  const files = e.target.files;
  if (!files || files.length === 0) return;

  const folderId = pathStack[pathStack.length - 1];
  const file = files[0];

  const formData = new FormData();
  formData.append('file', file);

  fetch(`http://127.0.0.1:8000/folders/${folderId}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  }).then(() => {
    fetchFiles(folderId);
    setIsFileModalOpen(false);
  });
};


  const currentFolderId = pathStack[pathStack.length - 1];

  const realFiles = (filesByFolder[currentFolderId] || []).map((file) => ({
    id: `file-${file.id}`,
    name: file.file_name,
    type: 'file',
    size: '',
    content: file.content,
  }));



  // Filter current folder items
  const currentItems = [...(currentFolder.children || []), ...realFiles].filter(item =>
  item.name.toLowerCase().includes(searchQuery.toLowerCase())
);

  if (!token) {
  return <LoginScreen onLoginSuccess={setToken} />;
}

  if (previewFile) {
  return <FilePreviewPage file={previewFile} onBack={() => setPreviewFile(null)} />;
}

  return (
    
    
    <div className="app-window">
      
      {/* Hidden file input for system local file browsing */}
      
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        multiple 
        onChange={handleNativeFileUpload}
      />

      {/* macOS Window Header Titlebar */}
      <div className="macos-titlebar">
        <div className="traffic-lights">
          <div className="traffic-light close"></div>
          <div className="traffic-light minimize"></div>
          <div className="traffic-light maximize"></div>
        </div>
        <div className="titlebar-text">Finder</div>
      </div>


      {!isAtRoot && <ChatWidget folderId={currentFolder.id} token={token} />}
      {/* Finder Container */}
      <div className="finder-container">
        
        {/* Sidebar displaying actual folder names */}
        <div className="finder-sidebar">
          <div className="sidebar-section-title">FAVORITES</div>
          
          {rootFolders.map(folder => {
            const isSelected = pathStack.length > 1 && pathStack[1] === folder.id;
            return (
              <div 
                key={folder.id}
                className={`sidebar-item ${isSelected ? 'active' : ''}`}
                onClick={() => {
  setPathStack(['root', folder.id]);
  setSelectedItemId(null);
  setSearchQuery('');
  fetchFiles(folder.id);
}}
              >
                <Folder size={16} color="#3b82f6" fill="#dbeafe" />
                <span>{folder.name}</span>
              </div>
            );
          })}
        </div>

        {/* Content View */}
        <div 
          className="finder-content"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Content Navbar */}
          <div className="content-navbar">
            <div className="nav-left-group">
              <button 
                className="nav-arrow-btn" 
                onClick={handleGoBack}
                disabled={isAtRoot}
                title="Back"
              >
                <ArrowLeft size={16} />
              </button>

              {/* Breadcrumb Path */}
              <div className="breadcrumb-container">
                {breadcrumbs.map((folder, idx) => (
                  <React.Fragment key={folder.id}>
                    {idx > 0 && <span className="breadcrumb-sep"><ChevronRight size={12} /></span>}
                    <span 
                      className={`breadcrumb-item ${idx === breadcrumbs.length - 1 ? 'active' : ''}`}
                      onClick={() => handleBreadcrumbClick(idx)}
                    >
                      {folder.name}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="nav-right-group">
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={12} color="#999999" style={{ position: 'absolute', left: '8px', pointerEvents: 'none' }} />
                <input 
                  type="text" 
                  className="search-input-mac"
                  placeholder="Search" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Grid Viewport */}
          <div className="finder-grid-viewport">
            
            {/* Warning banner if file creation attempted at root */}
            {dropErrorMessage && (
              <div className="root-restriction-banner">
                <AlertTriangle size={16} />
                <span>{dropErrorMessage}</span>
              </div>
            )}

            <div className="finder-grid">
              
              {/* 1. New Folder Card (ONLY rendered at Root level) */}
              {isAtRoot && (
                <div 
                  className="finder-card"
                  onClick={() => setIsFolderModalOpen(true)}
                  title="Create a new folder"
                >
                  <div className="icon-box">
                    <Folder size={52} color="#3b82f6" strokeDasharray="3 3" strokeWidth={1.5} fill="none" />
                    <div className="badge-plus-mac">
                      <Plus size={12} strokeWidth={3} />
                    </div>
                  </div>
                  <span className="item-name" style={{ color: '#2563eb', fontWeight: 500 }}>
                    New Folder
                  </span>
                </div>
              )}

              {/* 2. New / Drop File Card (ONLY rendered inside a folder) */}
              {!isAtRoot && (
                <div 
                  className="finder-card"
                  onClick={() => setIsFileModalOpen(true)}
                  title="Create or drop a new file inside this folder"
                >
                  <div className="icon-box">
                    <FileText size={52} color="#94a3b8" strokeDasharray="2 2" strokeWidth={1.5} fill="none" />
                    <div className="badge-plus-file">
                      <Plus size={12} strokeWidth={3} />
                    </div>
                  </div>
                  <span className="item-name" style={{ color: '#475569', fontWeight: 500 }}>
                    New / Drop File
                  </span>
                </div>
              )}

              {/* 3. Existing Items Grid */}
              {currentItems.map((item) => {
                const isSelected = selectedItemId === item.id;

                return (
                  <div 
                    key={item.id}
                    className={`finder-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedItemId(item.id)}
                    onDoubleClick={() => {
                      if (item.type === 'folder') {
                        handleOpenFolder(item.id);
                      } else {
                        setPreviewFile(item);
                      }
                    }}
                  >
                    <div className="icon-box">
                      {item.type === 'folder' ? (
                        <Folder size={52} color="#3b82f6" fill="#dbeafe" strokeWidth={1} />
                      ) : (
                        <FileText size={52} color="#64748b" fill="#f1f5f9" strokeWidth={1} />
                      )}
                    </div>
                    
                    <span className="item-name">{item.name}</span>

                    {/* Working Delete Button */}
                    <button 
                      className="delete-btn"
                      onClick={(e) => handleDeleteItem(e, item)}
                      title="Delete item"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}

            </div>
          </div>

          {/* Drag & Drop Visual Overlay */}
          {isDraggingOver && (
            <div className="mac-drop-overlay">
              <UploadCloud size={54} />
              <div style={{ fontSize: '16px', fontWeight: 600 }}>
                {isAtRoot ? "Cannot drop files at Home!" : `Drop files into "${currentFolder.name}"`}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                {isAtRoot ? "Files must be inside a folder." : "Files will be added directly into this folder."}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: New Folder */}
      {isFolderModalOpen && (
        <div className="mac-modal-overlay" onClick={() => setIsFolderModalOpen(false)}>
          <div className="mac-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="mac-modal-title">
              <FolderPlus size={18} color="#3b82f6" />
              <span>New Folder</span>
            </div>
            
            <form onSubmit={handleCreateFolder}>
              <input 
                type="text" 
                className="mac-input" 
                placeholder="Folder Name" 
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
              />
              <div className="mac-btn-group">
                <button 
                  type="button" 
                  className="mac-btn"
                  onClick={() => setIsFolderModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="mac-btn primary"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New File (Only inside folder) */}
      {isFileModalOpen && (
        <div className="mac-modal-overlay" onClick={() => setIsFileModalOpen(false)}>
          <div className="mac-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="mac-modal-title">
              <FilePlus size={18} color="#10b981" />
              <span>New File in "{currentFolder.name}"</span>
            </div>
            
            <form onSubmit={handleCreateFile}>
              <input 
                type="text" 
                className="mac-input" 
                placeholder="File Name (e.g. notes.txt)" 
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                autoFocus
              />
              <textarea 
                className="mac-input" 
                placeholder="File contents..." 
                rows={3}
                style={{ resize: 'vertical' }}
                value={newFileContent}
                onChange={(e) => setNewFileContent(e.target.value)}
              />

              <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Upload local file:</span>
                <button 
                  type="button" 
                  className="mac-btn"
                  style={{ fontSize: '12px', padding: '4px 12px' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse Computer...
                </button>
              </div>

              <div className="mac-btn-group">
                <button 
                  type="button" 
                  className="mac-btn"
                  onClick={() => setIsFileModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="mac-btn primary"
                >
                  Create File
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: File Preview */}
      {/* {previewFile && (
        <div className="mac-modal-overlay" onClick={() => setPreviewFile(null)}>
          <div className="mac-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="mac-modal-title">
              <FileText size={18} color="#64748b" />
              <span>{previewFile.name}</span>
            </div>

            <div style={{
              backgroundColor: '#f6f6f6',
              border: '1px solid #e0e0e0',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '14px',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#1d1d1f',
              maxHeight: '160px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap'
            }}>
              <ReactMarkdown>{previewFile.content || 'No text preview available.'}</ReactMarkdown>
            </div>

            <div style={{ fontSize: '11px', color: '#888', marginBottom: '14px' }}>
              Size: {previewFile.size || 'Unknown'}
            </div>

            <div className="mac-btn-group">
              <button 
                className="mac-btn danger"
                onClick={(e) => handleDeleteItem(e, previewFile)}
              >
                Delete File
              </button>
              <button 
                className="mac-btn"
                onClick={() => setPreviewFile(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )} */}

    </div>
    
  
);
  
}