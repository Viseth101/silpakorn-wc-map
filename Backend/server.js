const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

app.get('/wc', (req, res) =>{
  const data = fs.readFileSync('wcList.json', 'utf-8');
  res.json(JSON.parse(data));
})

app.listen(3000, ()=>{
  console.log('Server is running');
})