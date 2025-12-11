const vertexShaderSource = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

const fragmentShaderSource = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_texture;

void main() {
  gl_FragColor = texture2D(u_texture, v_texCoord);
}
`;

export class WebGLRenderer {
  constructor() {
    this.gl = null;
    this.canvas = null;
    this.program = null;
    this.attributes = {};
    this.uniforms = {};
    this.screenEntries = [];
    this.width = 0;
    this.height = 0;
  }

  static isSupported() {
    if (typeof document === 'undefined') return false;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!gl;
  }

  initialize(canvas) {
    if (!canvas) {
      throw new Error('需要有效的 Canvas 元素');
    }

    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true }) ||
      canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });

    if (!gl) {
      throw new Error('当前环境不支持 WebGL');
    }

    this.canvas = canvas;
    this.gl = gl;
    this.program = this._createProgram(gl, vertexShaderSource, fragmentShaderSource);

    gl.useProgram(this.program);

    this.attributes.position = gl.getAttribLocation(this.program, 'a_position');
    this.attributes.texCoord = gl.getAttribLocation(this.program, 'a_texCoord');
    this.uniforms.texture = gl.getUniformLocation(this.program, 'u_texture');

    gl.enableVertexAttribArray(this.attributes.position);
    gl.enableVertexAttribArray(this.attributes.texCoord);

    gl.clearColor(0, 0, 0, 0);
  }

  _createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`着色器编译失败: ${info}`);
    }
    return shader;
  }

  _createProgram(gl, vsSource, fsSource) {
    const vertexShader = this._createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = this._createShader(gl, gl.FRAGMENT_SHADER, fsSource);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`程序链接失败: ${info}`);
    }

    return program;
  }

  resize(width, height, pixelRatio = 1) {
    if (!this.gl || !this.canvas) return;
    this.width = width;
    this.height = height;

    this.canvas.width = width * pixelRatio;
    this.canvas.height = height * pixelRatio;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  _cleanupScreens() {
    if (!this.gl) return;
    this.screenEntries.forEach((entry) => {
      if (entry.texture) {
        this.gl.deleteTexture(entry.texture);
      }
      if (entry.buffer) {
        this.gl.deleteBuffer(entry.buffer);
      }
    });
    this.screenEntries = [];
  }

  setScreens(screens, canvasWidth, canvasHeight) {
    if (!this.gl) return;
    this._cleanupScreens();

    screens.forEach((screen) => {
      if (!screen.image) return;
      const texture = this.gl.createTexture();
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
      this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.RGBA,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        screen.image
      );

      const x1 = (screen.x / canvasWidth) * 2 - 1;
      const y1 = 1 - (screen.y / canvasHeight) * 2;
      const x2 = ((screen.x + screen.width) / canvasWidth) * 2 - 1;
      const y2 = 1 - ((screen.y + screen.height) / canvasHeight) * 2;

      const vertices = new Float32Array([
        x1, y2, 0, 1,
        x2, y2, 1, 1,
        x1, y1, 0, 0,
        x1, y1, 0, 0,
        x2, y2, 1, 1,
        x2, y1, 1, 0,
      ]);

      const buffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

      this.screenEntries.push({ texture, buffer });
    });
  }

  render() {
    if (!this.gl || !this.program) return;
    if (!this.screenEntries.length) return;

    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);

    this.screenEntries.forEach((entry) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, entry.buffer);
      gl.vertexAttribPointer(this.attributes.position, 2, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(this.attributes.texCoord, 2, gl.FLOAT, false, 16, 8);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, entry.texture);
      gl.uniform1i(this.uniforms.texture, 0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });
  }

  destroy() {
    this._cleanupScreens();
    if (this.program && this.gl) {
      this.gl.deleteProgram(this.program);
    }
    this.program = null;
    this.gl = null;
    this.canvas = null;
  }
}

export default WebGLRenderer;
