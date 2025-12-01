(function () {
  const genId = () => {
    const key = 'ai-chat-sessionId';
    let v = localStorage.getItem(key);
    if (!v) {
      v = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      localStorage.setItem(key, v);
    }
    return v;
  };

  let sessionId = genId();

  const el = {
    messages: document.getElementById('messages'),
    form: document.getElementById('chatForm'),
    input: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    fileList: document.getElementById('fileList'),
    newChatBtn: document.getElementById('newChatBtn'),
    sessionIdText: document.getElementById('sessionIdText')
  };

  const selectedFiles = [];

  function renderSessionId() {
    if (el.sessionIdText) {
      el.sessionIdText.textContent = sessionId.slice(0, 8) + '...';
    }
  }

  function addMessage(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.textContent = content;
    if (el.messages) {
      el.messages.appendChild(div);
      el.messages.scrollTop = el.messages.scrollHeight;
    }
  }

  function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message-box';
    errorDiv.innerHTML = `
      <div class="error-icon">!</div>
      <div class="error-content">
        <div class="error-text">${message}</div>
      </div>
      <div class="error-actions">
        <button class="retry-btn" onclick="location.reload()">🔄 Retry</button>
      </div>
    `;
    
    if (el.messages) {
      el.messages.appendChild(errorDiv);
      el.messages.scrollTop = el.messages.scrollHeight;
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch(`/api/history?sessionId=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      if (data.success && el.messages) {
        el.messages.innerHTML = '';
        data.messages.forEach(m => addMessage(m.role, m.content));
      }
    } catch (err) {
      console.error('Error loading history:', err);
    }
  }

  function updateFileList() {
    if (el.fileList) {
      el.fileList.innerHTML = '';
      selectedFiles.forEach(f => {
        const pill = document.createElement('div');
        pill.className = 'file-pill';
        pill.textContent = `${f.name} (${Math.round(f.size/1024)} KB)`;
        el.fileList.appendChild(pill);
      });
    }
  }

  function handleFiles(files) {
    for (const f of files) selectedFiles.push(f);
    updateFileList();
  }

  // Helper function to read file content
  function readFileContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  // Event listeners
  if (el.dropzone) {
    el.dropzone.addEventListener('click', () => el.fileInput.click());
  }
  
  if (el.fileInput) {
    el.fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
  }
  
  if (el.dropzone) {
    el.dropzone.addEventListener('dragover', (e) => { e.preventDefault(); el.dropzone.classList.add('dragover'); });
    el.dropzone.addEventListener('dragleave', () => el.dropzone.classList.remove('dragover'));
    el.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      el.dropzone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });
  }

  if (el.newChatBtn) {
    el.newChatBtn.addEventListener('click', async () => {
      sessionId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
      localStorage.setItem('ai-chat-sessionId', sessionId);
      renderSessionId();
      if (el.messages) el.messages.innerHTML = '';
      selectedFiles.length = 0;
      updateFileList();
    });
  }

  if (el.form) {
    el.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = el.input.value.trim();
      if (!text && selectedFiles.length === 0) return;

      if (text) addMessage('user', text);

      // Prepare files for upload
      const fileContents = [];
      if (selectedFiles.length > 0) {
        try {
          for (const file of selectedFiles) {
            const content = await readFileContent(file);
            fileContents.push({
              name: file.name,
              content: content,
              size: file.size,
              type: file.type || 'text/plain'
            });
          }
        } catch (fileError) {
          addMessage('assistant', 'Error reading files: ' + fileError.message);
          return;
        }
      }

      if (el.sendBtn) {
        el.sendBtn.disabled = true;
        el.sendBtn.textContent = 'Sending...';
      }

      try {
        // Call Express server which will proxy to n8n
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            chatInput: text,
            files: fileContents,
            sessionId: sessionId
          })
        });

        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || `Server returned ${res.status}`);
        }

        // Handle response format from n8n workflow
        let aiResponse = '';
        if (data && typeof data === 'object') {
          if (data.response) {
            aiResponse = data.response;
          } else if (data.content) {
            aiResponse = data.content;
          } else if (data.message) {
            aiResponse = data.message;
          } else if (data.success !== false) {
            aiResponse = JSON.stringify(data);
          } else {
            aiResponse = 'Error: ' + (data.error || 'Unknown error from AI service');
          }
        } else if (typeof data === 'string') {
          aiResponse = data;
        } else {
          aiResponse = 'No response from AI assistant';
        }

        if (aiResponse) {
          addMessage('assistant', aiResponse);
          
          // Update session ID if provided
          if (data.sessionId && data.sessionId !== sessionId) {
            sessionId = data.sessionId;
            localStorage.setItem('ai-chat-sessionId', sessionId);
            renderSessionId();
          }
        } else {
          addMessage('assistant', 'Error: Empty response from AI service');
        }

      } catch (err) {
        console.error('Error calling n8n workflow:', err);
        showError('Connection error: ' + err.message + '. Please check if n8n is running on port 5678.');
      } finally {
        if (el.sendBtn) {
          el.sendBtn.disabled = false;
          el.sendBtn.textContent = 'Send';
        }
        if (el.input) el.input.value = '';
        selectedFiles.length = 0;
        updateFileList();
      }
    });
  }

  renderSessionId();
  loadHistory();
})();