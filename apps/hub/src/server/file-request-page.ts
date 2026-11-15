import { PAGE_STYLE, escapeHtml, htmlPage } from './page-style';

const STYLE = `${PAGE_STYLE}
main { max-width: 480px; text-align: left; }
.brand { text-align: left; }
h1 { overflow-wrap: anywhere; }
.from { margin: 0 0 4px; }
.message { margin: 12px 0 0; color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere; }
label { display: block; margin: 20px 0 6px; font-weight: 600; }
input[type=text] { font: inherit; width: 100%; padding: 12px 14px; border-radius: 12px;
  border: 1px solid var(--muted); background: var(--bg); color: var(--text); }
input[type=file] { display: none; }
.drop { margin-top: 16px; border: 2px dashed var(--muted); border-radius: 16px; padding: 28px 16px;
  text-align: center; cursor: pointer; }
.drop.over { border-color: var(--accent); background: var(--bg); }
.drop strong { display: block; color: var(--text); }
button { font: inherit; font-weight: 600; cursor: pointer; border: 0; border-radius: 12px;
  padding: 12px 18px; background: var(--accent); color: #fff; width: 100%; margin-top: 16px; }
button.quiet { background: transparent; color: var(--text); border: 1px solid var(--muted); }
button:disabled { opacity: 0.5; cursor: default; }
ul { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 10px; }
li { background: var(--bg); border-radius: 12px; padding: 10px 12px; }
.row { display: flex; justify-content: space-between; gap: 12px; }
.row span { overflow-wrap: anywhere; }
.row small { color: var(--muted); white-space: nowrap; }
.bar { height: 6px; border-radius: 3px; background: var(--card); margin-top: 8px; overflow: hidden; }
.bar i { display: block; height: 100%; width: 0; background: var(--accent); }
li.done .bar i { background: #2e9e5b; }
li.failed .bar i { background: #d64545; }
.note { margin: 6px 0 0; font-size: 14px; color: var(--muted); }
li.failed .note { color: #d64545; }
.summary { margin: 16px 0 0; text-align: center; font-weight: 600; }
.hidden { display: none; }
`;

const SCRIPT = `
(function () {
  var base = location.pathname.replace(/\\/+$/, '');
  var CHUNK = 4 * 1024 * 1024;
  var who = document.getElementById('who');
  var picker = document.getElementById('pick');
  var drop = document.getElementById('drop');
  var list = document.getElementById('files');
  var send = document.getElementById('send');
  var more = document.getElementById('more');
  var summary = document.getElementById('summary');
  var queue = [];
  var busy = false;
  var delivered = 0;

  function readable(bytes) {
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var value = bytes;
    var index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
    return (index === 0 ? String(value) : value.toFixed(1)) + ' ' + units[index];
  }

  function pause(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function refresh() {
    var waiting = queue.some(function (entry) { return entry.state === 'waiting' || entry.state === 'failed'; });
    send.disabled = busy || !waiting || who.value.trim() === '';
  }

  function add(files) {
    for (var i = 0; i < files.length; i += 1) {
      var file = files[i];
      var item = document.createElement('li');
      var row = document.createElement('div');
      row.className = 'row';
      var label = document.createElement('span');
      label.textContent = file.name;
      var size = document.createElement('small');
      size.textContent = readable(file.size);
      row.appendChild(label);
      row.appendChild(size);
      var bar = document.createElement('div');
      bar.className = 'bar';
      var fill = document.createElement('i');
      bar.appendChild(fill);
      var note = document.createElement('p');
      note.className = 'note hidden';
      item.appendChild(row);
      item.appendChild(bar);
      item.appendChild(note);
      list.appendChild(item);
      queue.push({ file: file, item: item, fill: fill, note: note, state: 'waiting' });
    }
    refresh();
  }

  function request(method, url, headers, body, progress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, url);
      Object.keys(headers).forEach(function (key) { xhr.setRequestHeader(key, headers[key]); });
      if (progress) {
        xhr.upload.onprogress = function (event) { if (event.lengthComputable) progress(event.loaded); };
      }
      xhr.onload = function () {
        var json = null;
        try { json = JSON.parse(xhr.responseText); } catch (ignored) { json = null; }
        resolve({ status: xhr.status, json: json, offset: xhr.getResponseHeader('Upload-Offset') });
      };
      xhr.onerror = function () { reject(new Error('network')); };
      xhr.send(body);
    });
  }

  function problem(response) {
    var error = response.json && response.json.error;
    return new Error(error && error.message ? error.message : 'The upload was refused.');
  }

  async function sendOne(entry, name) {
    var file = entry.file;
    var headers = {
      'X-Uploader-Name': encodeURIComponent(name),
      'X-File-Name': encodeURIComponent(file.name)
    };
    var begin = await request('POST', base + '/files', Object.assign({ 'X-Upload-Length': String(file.size) }, headers), null);
    if (begin.status !== 201 || !begin.json) throw problem(begin);
    var uploadId = begin.json.uploadId;
    var offset = begin.json.offset;
    var done = begin.json.done;
    var failures = 0;
    while (!done) {
      var end = Math.min(offset + CHUNK, file.size);
      var start = offset;
      try {
        var reply = await request('PATCH', base + '/files/' + uploadId, Object.assign({ 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' }, headers), file.slice(offset, end), function (loaded) {
          entry.fill.style.width = Math.min(100, ((start + loaded) / Math.max(file.size, 1)) * 100) + '%';
        });
        if (reply.status === 200 && reply.json) {
          offset = reply.json.offset;
          done = reply.json.done;
          failures = 0;
        } else if (reply.status === 409) {
          var current = await request('HEAD', base + '/files/' + uploadId, headers, null);
          offset = Number(current.offset);
        } else {
          throw problem(reply);
        }
      } catch (cause) {
        if (cause.message !== 'network') throw cause;
        failures += 1;
        if (failures > 6) throw new Error('The connection kept dropping.');
        await pause(Math.min(1000 * failures, 5000));
        var check = await request('HEAD', base + '/files/' + uploadId, headers, null).catch(function () { return null; });
        if (check && check.status === 200) offset = Number(check.offset);
        else if (check && check.status === 404 && end >= file.size) done = true;
      }
    }
    entry.fill.style.width = '100%';
  }

  async function run() {
    var name = who.value.trim();
    busy = true;
    refresh();
    var failed = 0;
    for (var i = 0; i < queue.length; i += 1) {
      var entry = queue[i];
      if (entry.state !== 'waiting') continue;
      entry.state = 'sending';
      try {
        await sendOne(entry, name);
        entry.state = 'done';
        entry.item.className = 'done';
        delivered += 1;
      } catch (cause) {
        entry.state = 'failed';
        entry.item.className = 'failed';
        entry.note.textContent = cause.message;
        entry.note.className = 'note';
        failed += 1;
      }
    }
    busy = false;
    var total = delivered;
    summary.textContent = total + (total === 1 ? ' file sent.' : ' files sent.') + (failed > 0 ? ' ' + failed + ' could not be sent.' : '');
    summary.className = 'summary';
    more.className = 'quiet';
    queue = queue.filter(function (entry) { return entry.state === 'failed'; });
    refresh();
  }

  function retryFailed() {
    queue.forEach(function (entry) {
      if (entry.state === 'failed') {
        entry.state = 'waiting';
        entry.item.className = '';
        entry.note.className = 'note hidden';
        entry.fill.style.width = '0';
      }
    });
  }

  picker.addEventListener('change', function () { add(picker.files); picker.value = ''; });
  drop.addEventListener('click', function () { picker.click(); });
  drop.addEventListener('dragover', function (event) { event.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
  drop.addEventListener('drop', function (event) {
    event.preventDefault();
    drop.classList.remove('over');
    if (event.dataTransfer) add(event.dataTransfer.files);
  });
  who.addEventListener('input', refresh);
  send.addEventListener('click', function () { retryFailed(); run(); });
  more.addEventListener('click', function () { picker.click(); });
})();
`;

export interface FileRequestPageData {
  readonly title: string;
  readonly message: string | null;
  readonly fromName: string;
  readonly open: boolean;
  readonly reason: string | null;
}

function head(data: FileRequestPageData): string {
  const message = data.message === null ? '' : `<p class="message">${escapeHtml(data.message)}</p>`;
  return `<p class="brand">SmartEverything</p>
<p class="from">${escapeHtml(data.fromName)} is asking for files</p>
<h1>${escapeHtml(data.title)}</h1>${message}`;
}

export function fileRequestPageHtml(data: FileRequestPageData, nonce: string): string {
  if (!data.open) {
    return htmlPage({
      title: data.title,
      style: STYLE,
      body: `${head(data)}<p class="note">${escapeHtml(data.reason ?? 'No more files are accepted.')}</p>`,
    });
  }
  return htmlPage({
    title: data.title,
    style: STYLE,
    body: `${head(data)}
<label for="who">Your name</label>
<input id="who" type="text" autocomplete="name" placeholder="So they know who sent these">
<div id="drop" class="drop" role="button" tabindex="0"><strong>Choose files</strong>or drop them here</div>
<input id="pick" type="file" multiple>
<ul id="files"></ul>
<button id="send" type="button" disabled>Send files</button>
<button id="more" type="button" class="hidden">Send more files</button>
<p id="summary" class="summary hidden" role="status"></p>`,
    script: `<script nonce="${nonce}">${SCRIPT}</script>`,
  });
}

export function fileRequestNoticeHtml(heading: string, message: string): string {
  return htmlPage({
    title: heading,
    style: STYLE,
    body: `<p class="brand">SmartEverything</p><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(message)}</p>`,
  });
}
