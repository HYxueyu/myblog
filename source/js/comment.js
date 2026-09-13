(function() {
  var commentHTML = '<style>' +
    '.twikoo-comment-wrap{max-width:800px;margin:40px auto;padding:0 20px}' +
    '.twikoo-comment-wrap h3{font-size:1.2em;margin-bottom:20px;padding-left:10px;border-left:4px solid #0066cc}' +
    '.tk-list{margin-bottom:30px}' +
    '.tk-comment{padding:15px 0;border-bottom:1px solid #eee}' +
    '.tk-comment:last-child{border-bottom:none}' +
    '.tk-comment-head{display:flex;align-items:center;margin-bottom:8px}' +
    '.tk-avatar{width:36px;height:36px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;margin-right:10px;font-size:14px;font-weight:bold;flex-shrink:0}' +
    '.tk-nick{font-weight:600;font-size:.9em;color:#333}' +
    '.tk-time{font-size:.8em;color:#999;margin-left:10px}' +
    '.tk-content{margin-left:46px;font-size:.9em;line-height:1.6;color:#555;word-wrap:break-word}' +
    '.tk-form{margin-top:20px}' +
    '.tk-form-row{display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap}' +
    '.tk-form-row input{flex:1;min-width:120px;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:.9em;outline:none;transition:border-color .3s}' +
    '.tk-form-row input:focus{border-color:#0066cc}' +
    '.tk-form textarea{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:.9em;min-height:100px;resize:vertical;outline:none;transition:border-color .3s;font-family:inherit;box-sizing:border-box}' +
    '.tk-form textarea:focus{border-color:#0066cc}' +
    '.tk-form button{margin-top:10px;padding:8px 24px;background:#0066cc;color:#fff;border:none;border-radius:6px;font-size:.9em;cursor:pointer;transition:background .3s}' +
    '.tk-form button:hover{background:#0055aa}' +
    '.tk-form button:disabled{background:#ccc;cursor:not-allowed}' +
    '.tk-empty{text-align:center;color:#999;padding:30px 0;font-size:.9em}' +
    '.tk-loading{text-align:center;color:#999;padding:20px 0}' +
    '</style>' +
    '<h3>💬 评论 (<span id="tk-count">0</span>)</h3>' +
    '<div id="tk-list" class="tk-list"><div class="tk-loading">加载中...</div></div>' +
    '<div class="tk-form">' +
      '<div class="tk-form-row">' +
        '<input type="text" id="tk-nick" placeholder="昵称 *" maxlength="20">' +
        '<input type="email" id="tk-mail" placeholder="邮箱（选填）" maxlength="50">' +
        '<input type="url" id="tk-link" placeholder="网站（选填）" maxlength="100">' +
      '</div>' +
      '<textarea id="tk-content" placeholder="说点什么吧..." maxlength="1000"></textarea>' +
      '<button id="tk-submit">发表评论</button>' +
    '</div>';

  function init() {
    if (!isPostPage()) return;

    var container = document.getElementById('post-comment') || document.querySelector('#article-container') || document.querySelector('.post-content');
    if (!container) {
      var article = document.querySelector('#article-container') || document.querySelector('.article-container');
      if (article) {
        container = document.createElement('div');
        container.id = 'post-comment';
        article.appendChild(container);
      } else {
        return;
      }
    } else if (container.id !== 'post-comment') {
      var div = document.createElement('div');
      div.id = 'post-comment';
      container.appendChild(div);
      container = div;
    } else {
      container.innerHTML = '';
    }

    var wrap = document.createElement('div');
    wrap.className = 'twikoo-comment-wrap';
    wrap.innerHTML = commentHTML;
    container.appendChild(wrap);

    loadComments();
    document.getElementById('tk-submit').addEventListener('click', submitComment);
  }

  function isPostPage() {
    return window.location.pathname.match(/\/\d{4}\/\d{2}\/.+/) ||
           document.querySelector('#article-container') ||
           document.querySelector('.post-content');
  }

  function getPath() {
    return window.location.pathname;
  }

  function formatTime(ts) {
    var d = new Date(ts);
    var now = new Date();
    var diff = (now - d) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 2592000) return Math.floor(diff / 86400) + ' 天前';
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  function getAvatar(nick) {
    var first = (nick || '匿')[0].toUpperCase();
    var colors = ['#0066cc','#e74c3c','#27ae60','#f39c12','#9b59b6','#1abc9c','#e67e22','#2c3e50'];
    var hash = 0;
    for (var i=0; i<(nick||'').length; i++) { hash = nick.charCodeAt(i) + ((hash<<5)-hash); }
    return '<div class="tk-avatar" style="background:' + colors[Math.abs(hash)%colors.length] + '">' + first + '</div>';
  }

  function escape(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function loadComments() {
    var listEl = document.getElementById('tk-list');
    fetch('/api/comment?action=getComments&path=' + encodeURIComponent(getPath()))
      .then(function(r){return r.json();})
      .then(function(comments){
        document.getElementById('tk-count').textContent = comments.length;
        if (!comments.length) { listEl.innerHTML = '<div class="tk-empty">还没有评论，快来抢沙发吧~</div>'; return; }
        comments.sort(function(a,b){return b.created-a.created;});
        var html = '';
        for (var i=0;i<comments.length;i++) {
          var c = comments[i];
          html += '<div class="tk-comment"><div class="tk-comment-head">' + getAvatar(c.nick) + '<span class="tk-nick">' + escape(c.nick) + '</span><span class="tk-time">' + formatTime(c.created) + '</span></div><div class="tk-content">' + escape(c.content) + '</div></div>';
        }
        listEl.innerHTML = html;
      })
      .catch(function(){listEl.innerHTML = '<div class="tk-empty">评论加载失败</div>';});
  }

  function submitComment() {
    var nick = document.getElementById('tk-nick').value.trim();
    var content = document.getElementById('tk-content').value.trim();
    var mail = document.getElementById('tk-mail').value.trim();
    var link = document.getElementById('tk-link').value.trim();
    if (!nick) {alert('请输入昵称');return;}
    if (!content) {alert('请输入评论内容');return;}
    var btn = document.getElementById('tk-submit');
    btn.disabled = true; btn.textContent = '发表中...';
    fetch('/api/comment', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({action:'addComment',path:getPath(),nick:nick,mail:mail,content:content,link:link})
    })
    .then(function(r){return r.json();})
    .then(function(){document.getElementById('tk-content').value='';loadComments();btn.disabled=false;btn.textContent='发表评论';})
    .catch(function(){alert('评论失败');btn.disabled=false;btn.textContent='发表评论';});
  }

  if (document.readyState !== 'loading') {setTimeout(init, 500);}
  else {document.addEventListener('DOMContentLoaded', function(){setTimeout(init, 500);});}
})();
