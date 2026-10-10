import React, { useState, useRef, useEffect } from 'react';
import LoginScreen from './LoginScreen';
import FilePreviewPage from './FilePreviewPage';
import ChatWidget from './ChatWidget';
import { apiFetch } from './api';
import {
  Folder,
  FileText,
  ChevronRight,
  ArrowLeft,
  Plus,
  Search,
  UploadCloud,
  Trash2,
  FolderPlus,
  FilePlus,
  AlertTriangle
} from 'lucide-react';
import './App.css';

// Only the root lives here now. Folders and files come from the backend.
const initialFileSystem = {
  id: 'root',
  name: 'Home',
  type: 'folder',
  children: []
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

  const [filesByFolder, setFilesByFolder] = useState({});
  const [previewFile, setPreviewFile] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [dropErrorMessage, setDropErrorMessage] = useState('');
  const [uploadingName, setUploadingName] = useState(null); // label while uploading, else null
  const [folders, setFolders] = useState([]);

  const fileInputRef = useRef(null);

  // ---------- Backend fetches ----------

  const fetchFolders = () => {
    apiFetch(token, '/folders')
      .then((res) => res.json())
      .then((data) => setFolders(data));
  };

  const fetchFiles = (folderId) => {
    apiFetch(token, `/folders/${folderId}/files`)
      .then((res) => res.json())
      .then((data) => {
        setFilesByFolder((prev) => ({ ...prev, [folderId]: data }));
      });
  };

  useEffect(() => {
    if (!token) return;
    fetchFolders();
  }, [token]);

  // Translate the backend's flat folder list into the Finder UI's tree shape
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

  // ---------- Navigation helpers ----------

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

  const rootFolders = (fileSystem.children || []).filter(item => item.type === 'folder');

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

  const handleBreadcrumbClick = (index) => {
    setPathStack(pathStack.slice(0, index + 1));
    setSelectedItemId(null);
  };

  // ---------- Actions ----------

  const handleCreateFolder = (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    apiFetch(token, '/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newFolderName.trim() }),
    }).then(() => {
      fetchFolders();
      setNewFolderName('');
      setIsFolderModalOpen(false);
    });
  };

  const handleDeleteItem = (e, item) => {
    if (e) e.stopPropagation();

    if (item.type === 'folder') {
      apiFetch(token, `/folders/${item.id}`, { method: 'DELETE' }).then(() => {
        fetchFolders();
      });
    } else {
      const realFileId = String(item.id).replace('file-', '');
      const folderId = pathStack[pathStack.length - 1];

      apiFetch(token, `/files/${realFileId}`, { method: 'DELETE' }).then(() => {
        fetchFiles(folderId);
      });
    }

    if (selectedItemId === item.id) setSelectedItemId(null);
    if (previewFile?.id === item.id) setPreviewFile(null);
  };

  // Uploads one or many files, one at a time, to the folder that is open.
  const uploadFiles = async (fileList) => {
    if (isAtRoot) {
      alert('A file cannot exist outside a folder! Please open a folder first.');
      return;
    }
    if (uploadingName) return; // one batch at a time

    const files = Array.from(fileList);
    if (files.length === 0) return;

    const folderId = pathStack[pathStack.length - 1];
    const failed = [];

    setIsFileModalOpen(false);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadingName(
        files.length > 1
          ? `"${file.name}" (${i + 1} of ${files.length})`
          : `"${file.name}"`
      );

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await apiFetch(token, `/folders/${folderId}/upload`, {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          fetchFiles(folderId); // each file appears as soon as it finishes
        } else {
          const err = await res.json();
          failed.push(`${file.name}: ${err.detail || 'Upload failed'}`);
        }
      } catch (err) {
        failed.push(`${file.name}: could not reach the server`);
      }
    }

    setUploadingName(null);

    if (failed.length > 0) {
      alert(`${failed.length} upload(s) failed:\n\n${failed.join('\n')}`);
    }
  };

  // "Browse Computer..." picker
  const handleNativeFileUpload = (e) => {
    const files = Array.from(e.target.files || []); // copy BEFORE clearing the input
    e.target.value = ''; // lets you pick the same files again later
    uploadFiles(files);
  };

  // ---------- Drag and drop on the folder window ----------

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Moving over a child element also fires "leave" - ignore that, only react
    // when the cursor really leaves the folder window.
    if (e.currentTarget.contains(e.relatedTarget)) return;
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
      uploadFiles(e.dataTransfer.files);
    }
  };

  // ---------- Items shown in the grid ----------

  const currentFolderId = pathStack[pathStack.length - 1];

  const realFiles = (filesByFolder[currentFolderId] || []).map((file) => ({
    id: `file-${file.id}`, // prefixed so it can never collide with a folder id
    name: file.file_name,
    type: 'file',
    size: '',
    content: file.content,
  }));

  const currentItems = [...(currentFolder.children || []), ...realFiles].filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ---------- Early returns (all hooks are above this line) ----------

  if (!token) {
    return <LoginScreen onLoginSuccess={setToken} />;
  }

  if (previewFile) {
    return <FilePreviewPage file={previewFile} onBack={() => setPreviewFile(null)} />;
  }

  return (
    <div className="app-window">

      {/* Hidden file input used by "Browse Computer..." */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        multiple
        onChange={handleNativeFileUpload}
      />

      {/* Upload progress pill */}
      {uploadingName && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#1d1d1f',
            color: '#ffffff',
            padding: '10px 16px',
            borderRadius: '999px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            zIndex: 2000,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div className="upload-spinner" />
          Uploading and indexing {uploadingName}…
        </div>
      )}

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

        {/* Sidebar */}
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

        {/* Content View (also the drop target for files) */}
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

            {dropErrorMessage && (
              <div className="root-restriction-banner">
                <AlertTriangle size={16} />
                <span>{dropErrorMessage}</span>
              </div>
            )}

            <div className="finder-grid">

              {/* New Folder card (only at Home) */}
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

              {/* Upload Files card (only inside a folder) */}
              {!isAtRoot && (
                <div
                  className="finder-card"
                  onClick={() => setIsFileModalOpen(true)}
                  title="Upload files into this folder"
                >
                  <div className="icon-box">
                    <FileText size={52} color="#94a3b8" strokeDasharray="2 2" strokeWidth={1.5} fill="none" />
                    <div className="badge-plus-file">
                      <Plus size={12} strokeWidth={3} />
                    </div>
                  </div>
                  <span className="item-name" style={{ color: '#475569', fontWeight: 500 }}>
                    Upload Files
                  </span>
                </div>
              )}

              {/* Existing folders and files */}
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
                <button type="submit" className="mac-btn primary">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Upload Files (only inside a folder) */}
      {isFileModalOpen && (
        <div
          className="mac-modal-overlay"
          onClick={() => setIsFileModalOpen(false)}
          // A file dropped outside the dashed box must not make the browser open it
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
        >
          <div className="mac-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="mac-modal-title">
              <FilePlus size={18} color="#10b981" />
              <span>Upload to "{currentFolder.name}"</span>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                uploadFiles(e.dataTransfer.files);
              }}
              style={{
                border: '2px dashed #cbd5e1',
                borderRadius: '10px',
                padding: '32px 16px',
                textAlign: 'center',
                marginBottom: '14px',
              }}
            >
              <UploadCloud size={32} color="#94a3b8" />
              <div style={{ fontSize: '13px', color: '#475569', margin: '8px 0 12px' }}>
                Drag and drop files here
              </div>
              <button
                type="button"
                className="mac-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                Browse Computer...
              </button>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '10px' }}>
                PDF, images, .txt and .md
              </div>
            </div>

            <div className="mac-btn-group">
              <button
                type="button"
                className="mac-btn"
                onClick={() => setIsFileModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}