export class FileImage {
  constructor({ buffer, rowIndex }) {
    this.buffer = buffer;
    this.rowIndex = rowIndex;
  }

  static fromJson({ buffer, rowIndex }) {
    return new FileImage({
      buffer,
      rowIndex,
    });
  }

  getRowIndex() {
    return this.rowIndex;
  }

  getBuffer() {
    return this.buffer;
  }
}
