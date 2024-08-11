const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const users = {}; // To store user information, including their groups
const groups = {}; // To store groups and their members

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('public'));
app.use(bodyParser.json());

// Ensure 'temp' and 'uploads' directories exist
const createDirectoryIfNotExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

createDirectoryIfNotExists(path.join(__dirname, 'temp'));
createDirectoryIfNotExists(path.join(__dirname, 'uploads'));

app.get('/user/groups', (req, res) => {
  res.json(Object.keys(groups));
});

app.post('/user/join-group', (req, res) => {
  const { groupName, userid, password } = req.body;
  if (password === 'join') {
    if (groups[groupName]) {
      if (!groups[groupName].includes(userid)) {
        groups[groupName].push(userid);
      }
      res.json({ status: 'success', message: `Joined group ${groupName}` });
    } else {
      res.json({ status: 'fail', message: 'Group does not exist' });
    }
  } else {
    res.json({ status: 'fail', message: 'Incorrect password' });
  }
});


app.post('/admin/login', (req, res) => {
  const { userid, password } = req.body;
  if (userid === 'admin' && password === 'admin') {
    res.json({ status: 'success' });
  } else {
    res.json({ status: 'fail', message: 'Invalid credentials' });
  }
});

app.post('/user/login', (req, res) => {
  const { userid, password } = req.body;
  if (password === 'user') {
    const userGroups = Object.keys(groups).filter(group => groups[group].includes(userid));
    res.json({ status: 'success', user: { userid, groups: userGroups } });
  } else {
    res.json({ status: 'fail', message: 'Invalid credentials' });
  }
});

app.post('/admin/create-group', (req, res) => {
  const { groupName } = req.body;
  if (!groups[groupName]) {
    groups[groupName] = [];
    res.json({ message: 'Group created successfully.' });
  } else {
    res.json({ message: 'Group already exists.' });
  }
});

app.post('/admin/add-to-group', (req, res) => {
  const { groupName, userIds } = req.body;
  if (groups[groupName]) {
    userIds.forEach(userId => {
      if (!groups[groupName].includes(userId)) {
        groups[groupName].push(userId);
      }
    });
    res.json({ message: 'Users added to group successfully.' });
  } else {
    res.json({ message: 'Group does not exist.' });
  }
});

// Handle file uploads in chunks
app.post('/upload', upload.single('file'), (req, res) => {

  function removeAllFilesSync(directory) {
    const files = fs.readdirSync(directory);

    for(const file of files) {
      const filepath = path.join(directory, file);
      fs.unlinkSync(filepath);
    }
  }


  const { originalname, buffer } = req.file;
  const { chunkIndex, totalChunks, groupName, userid, password } = req.body;

  // Check if the user is admin
  if (userid !== 'admin' || password !== 'admin') {
    return res.status(403).send('Forbidden');
  }

  const tempFileName = `${crypto.randomBytes(16).toString('hex')}-${originalname}`;
  const tempFilePath = path.join(__dirname, 'temp', tempFileName);

  try {
    if (chunkIndex == 0) {
      fs.writeFileSync(tempFilePath, buffer);
    } else {
      fs.appendFileSync(tempFilePath, buffer);
    }

    console.log(`Chunk ${parseInt(chunkIndex) + 1} of ${totalChunks} for file ${originalname} uploaded`);

    if (parseInt(chunkIndex) + 1 === parseInt(totalChunks)) {
      const finalPath = path.join(__dirname, 'uploads', originalname);
      fs.renameSync(tempFilePath, finalPath);
      console.log(`File ${originalname} fully uploaded`);

      io.to(groupName).emit('file-uploaded', { fileName: originalname, groupName });

      const tempFolderPath = path.join(__dirname, 'temp');
      removeAllFilesSync(tempFolderPath);
    }

    res.send(`Chunk ${chunkIndex + 1} uploaded`);
  } catch (err) {
    console.error(`Error handling file chunk: ${err}`);
    res.status(500).send('Error uploading file');
  }
});

app.get('/download/:fileName', (req, res) => {
  const fileName = req.params.fileName;
  const filePath = path.join(__dirname, 'uploads', fileName);
  res.download(filePath);
});

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('join-group', (groupName) => {
    socket.join(groupName);
    console.log(`User joined group: ${groupName}`);
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
