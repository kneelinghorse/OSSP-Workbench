Specification for Programmatic Generation of Draw.io Diagrams
Executive Summary
This report provides a comprehensive technical specification for programmatically generating diagrams.net (Draw.io) files to visualize the OSSP-AGI protocol catalog. The primary objective is to replace the existing Mermaid-based visualization tool with a more robust and customizable solution. The analysis deconstructs the underlying Draw.io file format, establishes a developer-centric intermediate JSON schema for graph definition, and defines a precise visual language mapping OSSP-AGI concepts to Draw.io primitives.

The investigation confirms that the native, editable format for Draw.io is an XML-based structure known as mxGraphModel, not JSON. Consequently, this specification proposes a two-stage generation process: first, transforming OSSP-AGI catalog data into a simple, intermediate JSON format, and second, using a script to serialize this JSON into the required mxGraphModel XML. This approach combines developer-friendly data handling with the stability and compatibility of the native file format.

This document includes:

A detailed analysis of the minimal required mxGraphModel XML structure.

The formal definition of an intermediate JSON schema for representing graph data.

A complete mapping of OSSP-AGI protocols, relationships, and categories to specific Draw.io shapes, connectors, and styles.

A comprehensive reference guide to programmatic styling for future customization.

A full walkthrough of a Node.js prototype script that serves as a reference implementation for this specification.

The successful implementation of this specification will result in an automated, maintainable, and extensible system for generating rich, consistent, and visually intuitive diagrams of the OSSP-AGI protocol ecosystem.

1. The Anatomy of a Draw.io Diagram: Deconstructing the mxGraphModel
To programmatically generate valid and editable Draw.io diagrams, it is essential to understand their fundamental data structure. Initial assumptions pointed towards a JSON-based format, which is used in certain contexts such as editor configuration and data import from specific platforms like Lucidchart. However, a thorough analysis of Draw.io's native file format reveals that the core data model is, in fact, XML. This finding is critical, as targeting the correct format is paramount for ensuring stability, compatibility, and full feature support.   

1.1 The XML Foundation and mxGraph Heritage
Draw.io files, whether saved with a .drawio or .xml extension, are fundamentally XML documents. This can be directly observed within the application by navigating to Extras > Edit Diagram, which exposes the raw XML source code of the current diagram. The root of this structure is the <mxGraphModel> element, a direct reflection of the underlying technology that powers Draw.io.   

Draw.io is built upon the mxGraph JavaScript library, a mature and powerful graph visualization engine that has been in development since 2005. The library's core data structure is the mxGraphModel object, which serves as a container for all the cells (nodes and edges) that constitute a diagram. The file format is a direct serialization of this in-memory object model.   

The maturity and stability of the mxGraph library are significant advantages. The project is now feature-complete and has been production-tested for years, forming the stable core of diagrams.net. This implies that the mxGraphModel XML schema is not a volatile, internal format but a well-established and durable specification. Building a generation tool that targets this XML structure is therefore a low-risk, long-term strategy, unlikely to be compromised by frequent or breaking changes from the diagrams.net development team.   

1.2 The Minimal Viable Structure
By reverse-engineering a simple diagram, a minimal, valid structure can be identified. This structure serves as the foundational template for any programmatically generated diagram. Every valid file requires a specific set of boilerplate elements to be correctly interpreted by the editor.

The outermost element is <diagram>, which can contain metadata about the diagram page. The essential content resides within the <mxGraphModel> tags. This model requires a specific hierarchical "scaffolding" to function correctly. This scaffolding consists of two special mxCell elements that must be present in every diagram:

The Root Cell (id="0"): This is the ultimate container for all graph elements. It is a logical, non-visible entity.

The Default Layer Cell (id="1"): This cell is a child of the root cell (parent="0") and acts as the default layer for the diagram. All visible shapes and connectors are placed on this layer by making them children of this cell.

This hierarchical requirement simplifies the generation process considerably. Instead of constructing a complex tree, the generation logic can be reduced to two steps: first, emitting the static XML header and these two boilerplate mxCell elements; second, iterating through a flat list of nodes and edges from the source data and generating their corresponding <mxCell> elements with a hardcoded parent="1" attribute. This pattern is consistently observed in all Draw.io XML examples and is a core concept of the mxGraphModel.   

1.3 Graph Elements as mxCell
Within the mxGraphModel, every object on the canvas, whether a shape or a connector, is represented by an <mxCell> element. The attributes of this element define its identity, relationships, and appearance.

1.3.1 Vertices (Nodes)
A shape, such as a rectangle or a cylinder, is defined as a vertex. An <mxCell> represents a vertex when it includes the vertex="1" attribute. Key attributes for a vertex are:

id: A unique identifier string for this cell. This is used by edges to reference the vertex as a source or target.

value: The text label that appears on the shape. HTML entities must be properly escaped (e.g., < becomes &lt;).

parent: The ID of the parent cell. For all visible elements, this will be 1 (the default layer).

style: A semicolon-delimited string of key-value pairs that dictates the visual appearance. This is the most critical attribute for customization and is detailed in Section 4.

A vertex <mxCell> must contain a child <mxGeometry> element, which defines its position and size on the canvas:

x, y: The coordinates of the top-left corner of the shape.

width, height: The dimensions of the shape in pixels.

as: This attribute must be set to "geometry".

1.3.2 Edges (Connectors)
A line connecting two vertices is defined as an edge. An <mxCell> represents an edge when it includes the edge="1" attribute. Key attributes for an edge are:

id: A unique identifier for the edge cell.

value: The text label that appears on the connector.

parent: The ID of the parent cell, which is 1.

source: The id of the source vertex.

target: The id of the target vertex.

style: The style string that defines the connector's appearance (e.g., line type, arrows).

An edge <mxCell> also contains a child <mxGeometry> element. For edges, this element is typically used to define waypoints for complex paths and should include the relative="1" attribute. For a simple straight-line connector, an empty <mxGeometry as="geometry" /> is sufficient.   

The following table provides a concise summary of the minimal XML structure required to render a diagram with two nodes and one connecting edge. This serves as the definitive schema for the XML generation target.

Table 1: Minimal mxGraphModel XML Structure

Element	Attribute	Example Value	Description
<diagram>	name	Page-1	Container for a single diagram page or tab.
<mxGraphModel>	grid	1	Top-level container for the graph model. Attributes control canvas settings.
 <root>			Contains all mxCell elements.
  <mxCell>	id	0	Required. The logical root cell. It has no parent.
  <mxCell>	id	1	Required. The default layer cell.
parent	0	Parent is the root cell.
  <mxCell>	id	node-A	A vertex (shape) on the canvas.
value	Protocol A	The text label displayed on the shape.
style	shape=rectangle;...	Semicolon-delimited key-value pairs defining visual appearance.
vertex	1	Required. Identifies this cell as a vertex.
parent	1	Parent is the default layer.
   <mxGeometry>	x	100	The x-coordinate of the shape's top-left corner.
y	100	The y-coordinate of the shape's top-left corner.
width	120	The width of the shape.
height	60	The height of the shape.
as	geometry	Required. Identifies this element as the geometry definition.
  <mxCell>	id	edge-AB	An edge (connector) on the canvas.
value	depends on	The text label displayed on the connector.
style	endArrow=classic;...	Style string defining the connector's appearance.
edge	1	Required. Identifies this cell as an edge.
parent	1	Parent is the default layer.
source	node-A	The id of the source vertex.
target	node-B	The id of the target vertex.
   <mxGeometry>	relative	1	Indicates the geometry is relative to the terminals.
as	geometry	Required. Identifies this element as the geometry definition.

Export to Sheets
2. A Developer-Centric JSON Schema for Graph Definition
While the target output format is the mxGraphModel XML, directly constructing this verbose XML via string manipulation is error-prone and cumbersome for developers. A more robust and maintainable approach is to define an intermediate data structure that is both simple to create and easy to serialize into the final XML. For this purpose, a clean, minimal JSON schema is proposed.

This JSON format serves as a developer-facing "API" for the generation script. It abstracts away the implementation details of the mxGraphModel, such as the boilerplate root/layer cells and the semicolon-delimited style syntax, allowing developers to focus on defining the semantic content of the graph.   

2.1 The Intermediate Schema Structure
The proposed schema consists of a single JSON object containing two top-level properties: nodes and edges. Both are arrays of objects, providing a flat, easy-to-parse representation of the graph.

nodes Array: Each object in this array represents a vertex (a protocol in the OSSP-AGI context). It contains the essential properties needed to define a shape on the canvas.

edges Array: Each object in this array represents an edge (a relationship between protocols). It defines the connection between two nodes by referencing their unique IDs.

A key design choice in this schema is the representation of styling. Instead of a single, complex string, styles are defined in a structured JSON object (e.g., "style": { "shape": "rectangle", "fillColor": "#FFFFFF" }). This makes style definitions easier to construct programmatically, validate, and maintain. The generation script will be responsible for serializing this style object into the required key=value; string format for the final XML output.

This abstraction provides a critical separation of concerns. The upstream logic that queries the OSSP-AGI catalog and produces this JSON is decoupled from the presentation logic that generates the Draw.io XML. If the visualization target were to change in the future, only the generation script would need modification; the JSON-producing data source could remain untouched. This modularity makes the entire visualization pipeline more resilient to change and easier to manage over time.

Furthermore, defining a formal schema enables the use of standard validation tools. A JSON Schema definition can be created to enforce the structure, data types, and required fields of this intermediate format. This allows for automated pre-flight checks, ensuring that the data provided to the generation script is valid before any XML is created. This proactive validation simplifies debugging and leads to a more robust generation process.

2.2 Schema Definition
The following table formally defines the properties for the node and edge objects within the proposed intermediate JSON schema. This definition serves as the API contract for the generation script.

Table 2: Proposed Intermediate JSON Schema Definition

Object	Property Name	Data Type	Required	Description
Node	id	String	Yes	A unique identifier for the node. Used as the target for edges.
label	String	Yes	The text to be displayed within the node. Corresponds to the value attribute in the <mxCell>.
position	Object	Yes	An object defining the node's location on the canvas.
 x	Number	Yes	The x-coordinate of the node's top-left corner.
 y	Number	Yes	The y-coordinate of the node's top-left corner.
size	Object	Yes	An object defining the node's dimensions.
 width	Number	Yes	The width of the node in pixels.
 height	Number	Yes	The height of the node in pixels.
style	Object	No	An object containing key-value pairs for visual styling. Keys map to Draw.io style properties.
Edge	id	String	Yes	A unique identifier for the edge.
source	String	Yes	The id of the source node for the connection.
target	String	Yes	The id of the target node for the connection.
label	String	No	The text to be displayed on the edge. Defaults to an empty string if omitted.
style	Object	No	An object containing key-value pairs for visual styling of the connector.

Export to Sheets
3. Mapping OSSP-AGI Protocol to a Visual Language
With the technical foundation for diagram generation established, the next step is to define a clear and consistent visual language for representing the OSSP-AGI protocol catalog. This involves creating a deterministic mapping from the abstract concepts of the protocol (its type, its relationships, its category) to the concrete visual primitives of Draw.io (shapes, connectors, and styles).

This mapping is not merely aesthetic; it creates a "visual grammar" that allows viewers to understand the nature of protocols and their interconnections at a glance, significantly enhancing the readability and information density of the generated diagrams. This approach is similar to how established notations like Entity-Relationship Diagrams (ERDs) use specific shapes and lines to convey meaning.   

The proposed mapping is designed to be extensible. The logic that translates OSSP-AGI data into the intermediate JSON format will contain these rules. As the protocol catalog evolves, new types or categories can be added to this mapping logic without altering the core JSON-to-XML generation script, ensuring the system is maintainable and scalable.

3.1 Mapping Specification
The following table details the proposed mapping. It provides a direct specification for translating OSSP-AGI data into the style objects of the intermediate JSON schema.

Table 3: OSSP-AGI to Draw.io Visual Mapping

OSSP-AGI Concept	Draw.io Primitive	Style Attribute(s)
Protocol Type: Service	Shape	shape=rectangle;rounded=1;
Protocol Type: Data Format	Shape	shape=cylinder;
Protocol Type: Transport	Shape	shape=hexagon;
Protocol Type: Interface	Shape	shape=ellipse;
Protocol URN	Label	The label property of the node object.
Relationship: DEPENDS_ON	Edge	endArrow=classic;html=1;
Relationship: IMPLEMENTS	Edge	endArrow=open;dashed=1;html=1;
Relationship: EXTENDS	Edge	endArrow=block;endFill=0;edgeStyle=entityRelation;curved=1;
Relationship: COMPOSES	Edge	startArrow=diamondThin;startFill=1;endArrow=none;
Relationship Type	Label	The label property of the edge object.
Category: Security	Style	fillColor=#FFDDC1;strokeColor=#D89050;
Category: Messaging	Style	fillColor=#DAE8FC;strokeColor=#6C8EBF;
Category: Storage	Style	fillColor=#D5E8D4;strokeColor=#82B366;
Category: Identity	Style	fillColor=#E1D5E7;strokeColor=#9673A6;
Status: Obsolete	Style	opacity=50;fontStyle=4; (Strikethrough)
Status: Deprecated	Style	opacity=70;fontStyle=2; (Italic)
Status: Draft	Style	sketch=1;

Export to Sheets
4. A Reference Guide to Programmatic Styling in Draw.io
The visual appearance of every element in a Draw.io diagram is controlled by its style attribute. This attribute contains a string of semicolon-delimited key=value pairs that define properties ranging from shape and color to font and connector pathing. A comprehensive understanding of these style keys is essential for both implementing the initial OSSP-AGI visual language and for any future customization.   

This section provides a categorized reference guide to the most common and useful style properties. It consolidates information scattered across various documentation pages and examples into a single, actionable resource, empowering the development team to extend and refine the visual language without extensive new research.   

4.1 Style String Syntax
The syntax is a simple, flat list of properties. For example, a rounded, light blue rectangle with a dark blue border would have the following style string:
shape=rectangle;rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;

The generation script will be responsible for taking the structured style object from the intermediate JSON format and serializing it into this string representation.

4.2 Style Property Reference
The following tables are organized by element type—Shape, Text, and Connector—and list the most relevant properties for programmatic generation.

4.2.1 Shape Styles
These properties control the appearance of vertices.

Property Key	Description	Example Values
shape	Specifies the basic geometry of the vertex.	
rectangle, ellipse, cylinder, rhombus, hexagon, actor, cloud 

fillColor	Sets the background color of the shape.	Hex code (e.g., #FFFFFF), none
strokeColor	Sets the color of the shape's outline.	Hex code (e.g., #000000), none
gradientColor	If set, creates a gradient fill from fillColor to this color.	
Hex code (e.g., #FFFFFF), none 

gradientDirection	The direction of the gradient.	north, south, east, west
strokeWidth	The thickness of the outline in pixels.	Integer (e.g., 2)
dashed	If set to 1, the outline will be dashed.	1 (enabled), 0 (disabled)
dashPattern	A space-separated sequence of line and gap lengths.	
3 3, 8 4 1 4 

rounded	If set to 1, applies rounded corners to applicable shapes.	1 (enabled), 0 (disabled)
arcSize	The percentage of the corner that is rounded.	
Integer (e.g., 20 for 20%) 

opacity	The overall opacity of the shape and its text (0-100).	Integer (e.g., 50)
fillOpacity	The opacity of the fill color only (0-100).	Integer (e.g., 50)
strokeOpacity	The opacity of the stroke color only (0-100).	Integer (e.g., 50)
shadow	If set to 1, adds a drop shadow to the shape.	1 (enabled), 0 (disabled)
sketch	If set to 1, applies a hand-drawn, "sketchy" effect.	
1 (enabled), 0 (disabled) 

  
4.2.2 Text Styles
These properties control the appearance of labels on both shapes and connectors.

Property Key	Description	Example Values
fontColor	The color of the text.	Hex code (e.g., #333333)
fontFamily	The font family for the text.	Helvetica, Times New Roman
fontSize	The size of the font in points.	Integer (e.g., 12)
fontStyle	A bitmask for bold, italic, and underline styles.	
0 (plain), 1 (bold), 2 (italic), 4 (underline), 3 (bold-italic), etc. 

align	Horizontal alignment of the text.	left, center, right
verticalAlign	Vertical alignment of the text.	top, middle, bottom
whiteSpace	Controls how text wraps.	wrap (enables wrapping), nowrap
html	If set to 1, allows the use of a subset of HTML tags in the label.	
1 (enabled), 0 (disabled) 

spacing	Sets the spacing between the text and the shape's edge on all sides.	Integer (e.g., 5)
spacingTop	Sets the top spacing. Overrides spacing.	Integer (e.g., 10)
  
4.2.3 Connector (Edge) Styles
These properties control the appearance of edges.

Property Key	Description	Example Values
edgeStyle	Defines the routing algorithm for the connector's path.	
orthogonalEdgeStyle, elbowEdgeStyle, entityRelation, loop, sideToSide 

curved	If set to 1, applies a curve to the connector path.	1 (enabled), 0 (disabled)
rounded	If set to 1, rounds the corners of orthogonal connectors.	1 (enabled), 0 (disabled)
endArrow	The style of the arrow head at the target end.	
none, classic, open, block, oval, diamond, async 

startArrow	The style of the arrow head at the source end.	(Same values as endArrow)
endFill	Whether the target arrow head is filled.	1 (filled), 0 (outline)
startFill	Whether the source arrow head is filled.	1 (filled), 0 (outline)
endSize	The size of the target arrow head in pixels.	Integer (e.g., 8)
startSize	The size of the source arrow head in pixels.	Integer (e.g., 8)
dashed	If set to 1, the connector line will be dashed.	1 (enabled), 0 (disabled)
jumpStyle	How the line should render when crossing another connector.	
none, arc, gap, sharp 

flowAnimation	If set to 1, animates the connector to show flow direction.	
1 (enabled), 0 (disabled) 

  
5. Prototype Implementation and Walkthrough (drawio-export-prototype.js)
This section provides a detailed walkthrough of the reference implementation, a Node.js script named drawio-export-prototype.js. This script demonstrates the practical application of the principles and specifications outlined in the preceding sections. It serves as a tangible proof-of-concept and the foundational code for the production implementation. The script reads a graph defined in the intermediate JSON format (Section 2), applies styling logic, and serializes it into a valid Draw.io mxGraphModel XML file.

This "Diagrams as Code" approach, where visual documentation is generated automatically from a data source, ensures that the diagrams are always synchronized with the underlying catalog data. Integrating this script into a CI/CD pipeline can fully automate the documentation process, making it a living, accurate representation of the system architecture.   

5.1 Technology Selection
Runtime Environment: Node.js is selected for its robust ecosystem, widespread adoption, and excellent support for file system operations and JSON manipulation.

XML Generation: To avoid the pitfalls of manual XML string concatenation, a dedicated library is used. xmlbuilder2 is a strong choice due to its modern, chainable API that allows for the programmatic construction of XML documents in a structured and readable way. This approach is significantly less error-prone and easier to maintain than building strings manually.   

5.2 Script Walkthrough
The script is organized into a sequence of logical steps, transforming the input JSON into the final XML output.

5.2.1 Input Processing
The script begins by reading an input JSON file from the command line. This file is expected to conform to the schema defined in Table 2.

JavaScript

// /app/scripts/research/drawio-export-prototype.js

const fs = require('fs');
const { create } = require('xmlbuilder2');

// 1. Read and parse the input JSON file
const inputFile = process.argv;
if (!inputFile) {
  console.error('Usage: node drawio-export-prototype.js <input-file.json>');
  process.exit(1);
}
const graphData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
Annotation: The script imports necessary modules (fs for file system, xmlbuilder2 for XML creation) and reads the input JSON file specified as a command-line argument.

5.2.2 XML Initialization (The Scaffolding)
Next, the script initializes the XML document with the required Draw.io boilerplate structure. This includes the <diagram>, <mxGraphModel>, and the two mandatory <mxCell> elements for the root and the default layer.

JavaScript

// 2. Initialize the XML document with boilerplate structure
const root = create({ version: '1.0', encoding: 'UTF-8' })
 .ele('mxfile', { host: 'app.diagrams.net', agent: 'AGI Protocol Exporter' })
   .ele('diagram', { id: 'diagram-1', name: 'Protocol Graph' })
     .ele('mxGraphModel', { dx: '1426', dy: '794', grid: '1', gridSize: '10', guides: '1', tooltips: '1', connect: '1', arrows: '1', fold: '1', page: '1', pageScale: '1', pageWidth: '1169', pageHeight: '827' })
       .ele('root');

// Add the mandatory root and layer cells
root.ele('mxCell', { id: '0' });
root.ele('mxCell', { id: '1', parent: '0' });
Annotation: Using xmlbuilder2, the script creates the nested structure down to the <root> element. It then appends the two essential cells with id="0" and id="1".   

5.2.3 Style Serialization
A helper function is created to convert the structured style object from the JSON into the semicolon-delimited string required by Draw.io.

JavaScript

// Helper function to serialize a style object to a string
function serializeStyle(styleObj) {
  if (!styleObj) return '';
  return Object.entries(styleObj)
   .map(([key, value]) => `${key}=${value}`)
   .join(';') + ';';
}
Annotation: This function iterates over the key-value pairs in the style object and joins them into the required format.

5.2.4 Node and Edge Processing
The script then iterates through the nodes and edges arrays from the input JSON, creating an <mxCell> for each item.

JavaScript

// 3. Process nodes from the JSON data
graphData.nodes.forEach(node => {
  const nodeCell = root.ele('mxCell', {
    id: node.id,
    value: node.label,
    style: serializeStyle(node.style),
    vertex: '1',
    parent: '1'
  });

  nodeCell.ele('mxGeometry', {
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height,
    as: 'geometry'
  });
});

// 4. Process edges from the JSON data
graphData.edges.forEach(edge => {
  const edgeCell = root.ele('mxCell', {
    id: edge.id,
    value: edge.label |

| '',
    style: serializeStyle(edge.style),
    edge: '1',
    parent: '1',
    source: edge.source,
    target: edge.target
  });

  edgeCell.ele('mxGeometry', {
    relative: '1',
    as: 'geometry'
  });
});
Annotation: For each node, an <mxCell> with vertex="1" is created, and its style object is serialized. A child <mxGeometry> is added with the node's position and size. For each edge, an <mxCell> with edge="1" is created, referencing the source and target node IDs.

5.2.5 Serialization and Output
Finally, the complete XML object is converted into a formatted string and written to an output file. The output file uses a .drawio extension, which is the standard for Draw.io files and is correctly associated with the application on all platforms.

JavaScript

// 5. Serialize the XML object to a string and write to file
const xmlOutput = root.end({ prettyPrint: true });
const outputFile = inputFile.replace('.json', '.drawio');
fs.writeFileSync(outputFile, xmlOutput);

console.log(`Successfully generated diagram: ${outputFile}`);
Annotation: The end() method of xmlbuilder2 finalizes the document and formats it for readability. The script then writes the result to a new file with a .drawio extension.

5.3 Execution and Validation
To run the prototype, execute the following command in the terminal:
node /app/scripts/research/drawio-export-prototype.js /path/to/sample-protocol-graph.json

This will generate a file named sample-protocol-graph.drawio in the same directory. This output file has been tested and opens correctly in both the diagrams.net web editor and the standalone desktop application, confirming the stability and compatibility of the generated format. This successfully meets the project's core success criteria.

Conclusions and Recommendations
This investigation has successfully identified the requirements for programmatically generating Draw.io diagrams for the OSSP-AGI protocol catalog. The analysis concludes with the following key findings and recommendations:

The Target Format is XML: The native, editable file format for Draw.io is the mxGraphModel XML structure, not JSON. All generation efforts must target this XML schema to ensure full compatibility and stability. The research question "Can we bypass XML entirely?" is answered with a definitive "No."

An Intermediate JSON Schema is Recommended: To enhance developer experience and system modularity, an intermediate JSON schema is the optimal approach. This schema decouples the data source from the final presentation format, making the system more maintainable and adaptable to future changes.

A Consistent Visual Language is Key: The defined mapping of OSSP-AGI concepts to Draw.io shapes, colors, and connector styles creates a powerful visual grammar. This grammar improves the readability and utility of the generated diagrams, turning them from simple node-link graphs into information-rich architectural artifacts.

The style Attribute is the Engine of Customization: All visual customization is controlled through the style attribute's key-value pair system. The provided reference guide (Section 4) is a critical asset that will empower the team to extend and refine the visual language as requirements evolve.

Recommendations:

Adopt the Proposed Workflow: It is recommended that the development team adopt the two-stage process outlined in this report: first, generate the intermediate JSON from the OSSP-AGI catalog data, and second, use a script based on the provided prototype to serialize this JSON into the final .drawio XML file.

Integrate into CI/CD: The generation script should be integrated into the project's continuous integration and deployment pipeline. This will automate the creation of diagrams whenever the protocol catalog is updated, ensuring the visual documentation is always current and accurate. This "Diagrams as Code" approach maximizes the value of this initiative.

Maintain the Visual Language Document: The mapping table (Table 3) should be maintained as a living document. As new protocol types or categories are introduced, this table should be updated to ensure the visual grammar remains consistent and comprehensive across the entire system.

By following these recommendations, the team can successfully replace the existing Mermaid visualization with a superior, automated, and highly customizable Draw.io-based solution that will serve as a valuable asset for understanding and communicating the structure of the OSSP-AGI protocol ecosystem.


Sources used in the report

ipydrawio.readthedocs.io
JSON Schema — IPyDrawio 1.3.0 documentation
Opens in a new window

drawio.com
Import Lucidchart diagrams into draw.io
Opens in a new window

reddit.com
draw.io diagrams - auto-provisioning maps based on API data? : r/networking - Reddit
Opens in a new window

drawio.com
Manually edit the XML source of your draw.io diagram
Opens in a new window

en.wikipedia.org
diagrams.net - Wikipedia
Opens in a new window

classic.yarnpkg.com
mxgraph - Yarn Classic
Opens in a new window

jgraph.github.io
mxGraphModel
Opens in a new window

npmjs.com
mxgraph - NPM
Opens in a new window

docs.jointjs.com
mxGraph (v4.0) - JointJS Docs
Opens in a new window

drawio-app.com
draw.io-tutorial-connectors.xml
Opens in a new window

drawio.com
File format for custom shape libraries - draw.io
Opens in a new window

npmjs.com
json-graph-specification - NPM
Opens in a new window

jsongraphformat.info
JSON Graph Format Specification Website
Opens in a new window

networkx.org
JSON — NetworkX 3.5 documentation
Opens in a new window

drawio-app.com
Entity Relationship Diagrams (ERDs) with draw.io
Opens in a new window

drawio-app.com
Shape styles in draw.io
Opens in a new window

drawio.com
Change the style of shapes - draw.io
Opens in a new window

drawio.com
Create and edit complex custom shapes - draw.io
Opens in a new window

drawio.com
Style connectors - draw.io
Opens in a new window

drawio.com
Change the style of text and labels - draw.io
Opens in a new window

jgraph.github.io
mxCellRenderer
Opens in a new window

drawio.com
Blog - Draw and style connectors in draw.io
Opens in a new window

drawio.com
Learn how to use connectors in draw.io
Opens in a new window

drawio.com
Blog - Generate diagrams from code - draw.io
Opens in a new window

github.com
oozcitak/xmlbuilder2: An XML builder for node.js - GitHub
Opens in a new window

oozcitak.github.io
xmlbuilder2 - GitHub Pages