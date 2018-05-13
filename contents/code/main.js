// ----------
// Parameters
// ----------

// readConfig returns an object, so needs to be converted if you want to use === instead of ==
var gap = Number(readConfig("gap", 16));
var dividerBounds = Number(readConfig("dividerBounds", 0.2)); // from this value to 1-value
var dividerStepSize = Number(readConfig("dividerStepSize", 0.05));
var moveThreshold = Number(readConfig("moveThreshold", 0.5)); // move clients outside this fraction of its own size
var opacity = Number(readConfig("opacity", 0.9));
var noOpacity = ToBool(readConfig("noOpacity", false));
var noBorder = ToBool(readConfig("noBorder", true));

var margin =
{
  top: Number(readConfig("topMargin", 0)),
  bottom: Number(readConfig("bottomMargin", 0)),
  left: Number(readConfig("leftMargin", 0)),
  right: Number(readConfig("rightMargin", 0)),
};

var fullClients = TrimSplitString(readConfig("fullClients", "texstudio, inkscape, gimp, designer, creator, kdevelop, kdenlive").toString());

var halfClients = TrimSplitString(readConfig("halfClients", "chromium, kate, spotify").toString())

var ignoredClients = TrimSplitString("ksmserver, krunner, lattedock, Plasma, plasma, plasma-desktop, plasmashell, plugin-container, ".concat(readConfig("ignoredClients", "wine, overwatch").toString()));

var ignoredCaptions = TrimSplitString(readConfig("ignoredCaptions", "Trace Bitmap (Shift+Alt+B), Document Properties (Shift+Ctrl+D)").toString());

// -----------------
// Library Functions
// -----------------

function TrimSplitString (string)
{
  var split = string.split(",");
  for (var i = 0; i < split.length; i++)
  {
    if (split[i].trim() === "") {split.splice(i, 1); continue;};
    split[i] = split[i].trim();
  };
  return split;
};

function ToBool (value)
{
  if (value == false) {return false;}
  else {return true;};
};

function GetDesktopTotal ()
{
  return workspace.desktops*workspace.numScreens;
};

function GetDesktopNumber (desktopIndex)
{
  return Math.floor(desktopIndex/workspace.numScreens)+1; // indexing of desktops starts at 1 by Kwin
};

function GetScreenNumber (desktopIndex)
{
  return desktopIndex%workspace.numScreens;
};

function GetDesktopIndex ()
{
  return workspace.numScreens*(workspace.currentDesktop-1)+workspace.activeScreen;
};

function GetDesktopRows ()
{
  return workspace.desktopGridHeight;
};
  
function GetDesktopCols ()
{
  return workspace.desktopGridWidth;
};

// --------------
// Layout Classes
// --------------

function Column ()
{
  this.clients = [];
  this.dividers = [];
  
  this.nclients = function () {return this.clients.length;}
  this.ndividers = function () {return this.dividers.length;};
  
  this.minSize = function ()
  {
    var sum = 0;
    for (var i = 0; i < this.nclients(); i++)
    {
      sum += this.clients[i].minSize;
    };
    return sum;
  };
  
  this.addClient = function (client) // the size is the total size of a virtual desktop this column can occupy
  {
    this.clients.push(client);
    if (this.nclients() !== 0) {this.dividers.push(0);}; // do not add a new divider when the first client is added to the column
    return 0;
  };
  
  this.removeClient = function (windowId)
  {
    for (var i = 0; i < this.nclients(); i++)
    {
      if (this.clients[i].windowId === windowId)
      {
        this.clients.splice(i, 1);
        if (i !== 0) this.dividers.splice(i-1, 1); // the first client does not have a divider, thus it can not be removed
        return 0;
      };
    };
    return -1;
  };
  
  this.getClient = function (windowId)
  {
    for (var i = 0; i < this.nclients(); i++)
    {
      if (this.clients[i].windowId === windowId) {return this.clients[i];};
    };
    return -1;
  };
  
  // rendering
  this.render = function (x, width, areaY, areaHeight, columnIndex, desktopIndex, layerIndex)
  {
    var y = areaY + margin.top + gap;
    var clientHeight = (areaHeight - margin.top - margin.bottom - ((this.nclients() + 1) * gap)) / this.nclients();
    
    var current = 0;
    var previous = 0;
    var divider = 0;
    for (var i = 0; i < this.nclients(); i++)
    { 
      if (i !== 0) {divider = this.dividers[i-1];};
      previous = current;
      current = clientHeight * divider;
      
      var height = -previous + clientHeight + current;
      
      // rendering the client
      var geometry = 
      {
        x: Math.floor(x),
        y: Math.floor(y),
        width: Math.floor(width),
        height: Math.floor(height),
      };
      
      this.clients[i].noBorder = noBorder;
      if (noOpacity) {this.clients[i].opacity = 1;}
      else {this.clients[i].opacity = opacity;};
      
      this.clients[i].desktop = GetDesktopNumber(desktopIndex);
      this.clients[i].screen = GetScreenNumber(desktopIndex);
      this.clients[i].geometry = geometry;
      this.clients[i].geometryRender = geometry;
      this.clients[i].clientIndex = i;
      this.clients[i].columnIndex = columnIndex;
      this.clients[i].desktopIndex = desktopIndex;
      this.clients[i].layerIndex = layerIndex;
      
      y += height + gap;
    };
    return 0;
  };
  
};

function Desktop ()
{
  this.maxRows = 5;
  this.maxCols = 4;
  
  this.columns = [];
  this.dividers = [];
  
  this.ncolumns = function () {return this.columns.length;};
  this.ndividers = function () {return this.dividers.length;};
  
  this.addColumn = function (column)
  {
    if (this.ncolumns() >= this.maxCols) {return -1};
    this.columns.push(column);
    if (this.ncolumns() !== 0) {this.dividers.push(0);}; // do not add a new divider when the first column is added to the desktop
    return 0;
  };
  
  this.removeColumn = function (columnIndex)
  {
    if (columnIndex >= this.ncolumns()) {return -1;};
    this.columns.splice(columnIndex, 1);
    if (columnIndex !== 0) {this.dividers.splice(columnIndex-1, 1);};
    return 0;
  };
  
  this.addClient = function (client)
  {
    var smallestColumn = null;
    
    // try to add to an existing column
    for (var i = 0; i < this.ncolumns(); i++)
    {
      if (this.columns[i].minSize() + client.minSize >= 1/this.ncolumns() || this.columns[i].nclients() >= this.maxRows) {continue;}; // check if the client fits
      if (this.columns[i].nclients() < this.ncolumns()) // add the client if the number of rows is smaller than the number of columns
      {
        return this.columns[i].addClient(client);
      }
      else if (this.ncolumns() >= this.maxCols)
      {
        if (i < smallestColumn) {smallestColumn = i;};
      };
    };
    
    if (smallestColumn !== null) {return this.columns[smallestColumn].addClient(client);};
    
    // then try to add a new column for the client
    var column = new Column();
    if (column.addClient(client) === -1) {return -1;};
    if (this.addColumn(column) === -1) {return -1;};
    
    return 0;
  };
  
  this.removeClient = function (windowId)
  {
    for (var i = 0; i < this.ncolumns(); i++)
    {
      if (this.columns[i].removeClient(windowId) === 0)
      {
        if (this.columns[i].nclients() === 0) {this.removeColumn(i);};
        return 0;
      };
    };
    return -1;
  };
  
  this.getClient = function (windowId)
  {
    var client = -1;
    for (var i = 0; i < this.ncolumns(); i++)
    {
      client = this.columns[i].getClient(windowId);
      if (client !== -1) {break;};
    };
    return client;
  };
  
  // rendering
  this.render = function (desktopIndex, layerIndex)
  {
    var check = 0;
    
    var area = workspace.clientArea(0, GetScreenNumber(desktopIndex), GetDesktopNumber(desktopIndex));
    
    var x = area.x + margin.left + gap; // first x coordinate
    var columnWidth = (area.width - margin.left - margin.right - ((this.ncolumns() + 1) * gap)) / this.ncolumns(); // width per column
    
    var currentAddedWidth = 0;
    var previousAddedWidth = 0;
    var divider = 0;
    for (var i = 0; i < this.ncolumns(); i++)
    { 
      if (i !== 0) {divider = this.dividers[i-1];};
      previousAddedWidth = currentAddedWidth;
      currentAddedWidth = columnWidth * divider;
      
      var width = -previousAddedWidth + columnWidth + currentAddedWidth;
      check += this.columns[i].render(x, width, area.y, area.height, i, desktopIndex, layerIndex);
      x += width + gap;
    };
    return check;
  };
  
};

function Layer ()
{
  this.desktops = [];
  this.ndesktops =  function () {return this.desktops.length;};
  
  this.addDesktop = function (desktop)
  {
    if (GetDesktopTotal()-this.ndesktops() < 1) {return -1;};
    this.desktops.push(desktop);
    return 0;
  };
  
  this.removeDesktop = function (desktopIndex)
  {
    if (desktopIndex >= this.ndesktops()) {return -1;};
    this.desktops.splice(desktopIndex, 1);
    return 0;
  };
  
  this.addClient = function (client)
  {
    var added = -1;
    // try to add to current desktop
    var index = GetDesktopIndex();
    while (index >= this.ndesktops())
    {
      var desktop = new Desktop();
      this.addDesktop(desktop);
    };
    added = this.desktops[index].addClient(client);
    if (added === 0) {return added;};
    // try to add to any of the current desktops
    for (var i = 0; i < this.ndesktops(); i++)
    {
      added = this.desktops[i].addClient(client);
      if (added === 0) {return added;};
    };
    // make a new desktop (if possible) and add to that
    var desktop = new Desktop();
    if (this.addDesktop(desktop) === -1) {return -1;};
    return this.desktops[this.ndesktops()-1].addClient(client);
  };
  
  this.removeClient = function (windowId)
  {
    for (var i = 0; i < this.ndesktops(); i++)
    {
      if (this.desktops[i].removeClient(windowId) === 0)
      {
        if (this.desktops[i].ncolumns() === 0) {return this.removeDesktop(i);};
        return 0;
      };
    };
    return -1;
  };
  
  this.getClient = function (windowId)
  {
    var client = -1;
    for (var i = 0; i < this.ndesktops(); i++)
    {
      client = this.desktops[i].getClient(windowId);
      if (client !== -1) {break;};
    };
    return client;
  };
  
  this.movePreviousDesktop = function (clientIndex, desktopIndex)
  {
    var client = this.desktops[desktopIndex].clients[clientIndex];
    for (var i = desktopIndex-1; i >= 0; i--)
    {
      if (this.desktops[i].size()+client.minSize > 1) {continue;};
      this.desktops[desktopIndex].removeClient(client.windowId);
      this.desktops[i].addClient(client);
      return 0;
    };
    return -1;
  };
  
  this.moveNextDesktop = function (clientIndex, desktopIndex)
  {
    // client needs to be a copy, not a reference to the same
    var client = this.desktops[desktopIndex].clients[clientIndex];
    for (var i = desktopIndex+1; i < this.ndesktops(); i++)
    {
      if (this.desktops[i].size()+client.minSize > 1) {continue;};
      this.desktops[desktopIndex].removeClient(client.windowId);
      this.desktops[i].addClient(client);
      return 0;
    };
    var desktop = new Desktop();
    if (this.addDesktop(desktop) !== -1)
    {
      this.desktops[desktopIndex].removeClient(client.windowId);
      this.desktops[this.ndesktops()-1].addClient(client);
      return 0;
    };
    return -1;
  };
  
  // rendering
  this.render = function (layerIndex)
  {
    var check = 0;
    for (var i = 0; i < this.ndesktops(); i++)
    {
      check += this.desktops[i].render(i, layerIndex);
    };
    return check;
  };
  
};

function Layout ()
{
  this.layers = [];
  this.nlayers = function () {return this.layers.length;};
  
  this.addLayer = function (layer) 
  {
    this.layers.push(layer);
    return 0;
  };
  
  this.removeLayer = function (layerIndex)
  {
    if (layerIndex >= this.nlayers()) {return -1;};
    this.layers.splice(layerIndex, 1);
    return 0;
  };
  
  this.addClient = function (client)
  {
    var added = -1;
    for (var i = 0; i < this.nlayers(); i++)
    {
      added = this.layers[i].addClient(client);
      if (added === 0) {return added};
    };
    var layer = new Layer();
    this.addLayer(layer);
    return this.layers[this.nlayers()-1].addClient(client);
  };
  
  this.removeClient = function (windowId)
  {
    removed = -1;
    for (var i = 0; i < this.nlayers(); i++)
    {
      removed = this.layers[i].removeClient(windowId);
      if (removed === 0)
      {
        if (this.layers[i].ndesktops() === 0) {removed = this.removeLayer(i);};
        break;
      };
    };
    return removed;
  };
  
  this.getClient = function (windowId)
  {
    client = -1;
    for (var i = 0; i < this.nlayers(); i++)
    {
      client = this.layers[i].getClient(windowId);
      if (client !== -1) {break;};
    };
    return client;
  };
  
  this.movePreviousDesktop = function (clientIndex, desktopIndex, layerIndex)
  {
    if (layerIndex >= this.nlayers()) {return -1;};
    return this.layers[layerIndex].movePreviousDesktop(clientIndex, desktopIndex);
  };
  
  this.moveNextDesktop = function (clientIndex, desktopIndex, layerIndex)
  {
    if (layerIndex >= this.nlayers()) {return -1;};
    return this.layers[layerIndex].moveNextDesktop(clientIndex, desktopIndex);
  };
  
  // rendering
  this.render = function ()
  {
    var check = 0;
    for (var i = 0; i < this.nlayers(); i++)
    {
      check += this.layers[i].render(i);
    };
    return check;
  };
  
};

// ---------------
// Client Validity
// ---------------

function CheckClient (client)
{  
  if (client.specialWindow || client.dialog) {return -1;};
  
  var clientClass = client.resourceClass.toString();
  var clientName = client.resourceName.toString();
  var clientCaption = client.caption.toString();
  
  for (var i = 0; i < ignoredCaptions.length; i++)
  {
    if (ignoredCaptions[i] === clientCaption) {return -1;};
  };
  
  for (var i = 0; i < ignoredClients.length; i++)
  {
    if (clientClass.indexOf(ignoredClients[i]) !== -1) {return -1;};
    if (clientName.indexOf(ignoredClients[i]) !== -1) {return -1;};
  };
  
  var minSize = 0;
//   var minSize = 0.25;
//   for (var i = 0; i < halfClients.length; i++)
//   {
//     if (clientClass.indexOf(halfClients[i]) !== -1 || clientClass.indexOf(halfClients[i]) !== -1)
//     {
//       minSize = 0.5;
//       break;
//     };
//   };
//   for (var i = 0; i < fullClients.length; i++)
//   {
//     if (clientClass.indexOf(fullClients[i]) !== -1 || clientName.indexOf(fullClients[i]) !== -1)
//     {
//       minSize = 1;
//       break;
//     };
//   };
  
  client.minSize = minSize;
  return client;
};

// ---------------------------
// Connecting The KWin Signals
// ---------------------------

var addedClients = {}; // windowId of added clients
var layout = new Layout(); // main class, contains all methods

workspace.clientActivated.connect // clientAdded does not work for a lot of clients
(
  function (client)
  {
    if (client === null || client.windowId in addedClients) {return -1;};
    if (CheckClient(client) === -1) {return -1;}; // on succes adds minSize to client
    if (layout.addClient(client) === -1) {return -1;};
    addedClients[client.windowId] = true;
    layout.render();
    workspace.currentDesktop = client.desktop;
    ConnectClient(client); // connect client signals
    return 0;
  }
);

workspace.clientRemoved.connect
(
  function (client)
  {
    if (!(client.windowId in addedClients)) {return -1;};
    delete addedClients[client.windowId];
    var removed = layout.removeClient(client.windowId);
    if (removed === 0)
    {
      layout.render();
    };
    return removed;
  }
);

function ConnectClient (client)
{
  client.clientFinishUserMovedResized.connect
  (
    function (client)
    {
      var client = layout.getClient(client.windowId);
      if (client === -1) {return -1;};
      if (GeometryResized(client) === -1 && GeometryMoved(client) === -1) {return -1;};
      return layout.renderDesktop(client.desktopIndex, client.layerIndex);
    }
  );
  client.clientStepUserMovedResized.connect
  (
    function (client)
    {
      var client = layout.getClient(client.windowId);
      if (client === -1) {return -1;};
      if (GeometryResized(client) === -1) {return -1;};
      return layout.renderDesktop(client.desktopIndex, client.layerIndex);
    }
  );
  return 0;
};

// ------------------
// Creating Shortcuts
// ------------------

registerShortcut
(
  "Tiling-Gaps: Move Next Desktop",
  "Tiling-Gaps: Move Next Desktop",
  "Meta+End",
  function ()
  {
    client = layout.getClient(workspace.activeClient.windowId);
    if (client === -1) {return -1;};
    if (layout.moveNextDesktop(client.clientIndex, client.desktopIndex, client.layerIndex) === -1) {return -1;};
    layout.layers[client.layerIndex].render(client.layerIndex);
    workspace.currentDesktop = client.desktop;
    return 0;
  }
);

registerShortcut
(
  "Tiling-Gaps: Move Previous Desktop",
  "Tiling-Gaps: Move Previous Desktop",
  "Meta+Home",
  function ()
  {
    client = layout.getClient(workspace.activeClient.windowId);
    if (client === -1) {return -1;};
    if (layout.movePreviousDesktop(client.clientIndex, client.desktopIndex, client.layerIndex) === -1) {return -1;};
    layout.layers[client.layerIndex].render(client.layerIndex);
    workspace.currentDesktop = client.desktop;
    return 0;
  }
);

registerShortcut
(
  "Tiling-Gaps: Toggle Border",
  "Tiling-Gaps: Toggle Border",
  "Meta+P",
  function ()
  {
    noBorder = !noBorder;
    return layout.render();
  }
);

registerShortcut
(
  "Tiling-Gaps: Toggle Opacity",
  "Tiling-Gaps: Toggle Opacity",
  "Meta+O",
  function ()
  {
    noOpacity = !noOpacity;
    return layout.render();
  }
);

registerShortcut
(
  "Tiling-Gaps: Close Desktop",
  "Tiling-Gaps: Close Desktop",
  "Meta+Q",
  function ()
  {
    var index = GetDesktopIndex();
    for (var i = 0; i < layout.nlayers(); i++)
    {
      var layer = layout.layers[i];
      if (index >= layer.ndesktops()) {return -1;};
      var desktop = layer.desktops[index];
      for (var j = 0; j < desktop.nclients(); j++)
      {
        desktop.clients[j].closeWindow();
      };
      layout.removeDesktop(index, i);
    };
    return layout.render();
  }
);

registerShortcut
(
  "Tiling-Gaps: Maximize",
  "Tiling-Gaps: Maximize",
  "Meta+M",
  function ()
  {
    var client = layout.getClient(workspace.activeClient.windowId);
    if (client === -1) {return -1;};
    
    var area = workspace.clientArea(0, client.screen, client.desktop);
    client.geometry = 
    {
      x: Math.floor(gap+area.x+margin.left),
      y: Math.floor(gap+area.y+margin.top),
      width: Math.floor(area.width-margin.left-margin.right-2*gap),
      height: Math.floor(area.height-margin.top-margin.bottom-2*gap),
    };
    return 0;
  }
);

registerShortcut
(
  "Tiling-Gaps: Refresh (Minimize)",
  "Tiling-Gaps: Refresh (Minimize)",
  "Meta+N",
  function ()
  {
    return layout.render();
  }
);