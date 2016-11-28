'use strict';

const LogLevel = {
  TRACE: 0,
  DEBUG: 1,
  INFO:  2,
  WARN:  3,
  ERROR: 4,
  FATAL: 5,
};
const logLevelNames = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

class RichOutput {
  constructor() {
    if (new.target === RichOutput)
      throw TypeError('Cannot instantiate abstract class RichOutput');
  }
  /* All text can include HTML-like markup, with the following supported tags:
   *   <strong> <em> <code>
   *   <black> <red> <green> <yellow> <blue> <magenta> <cyan> <white>
   *   <bg-black> <bg-red> <bg-green> <bg-yellow> <bg-blue> <bg-magenta> <bg-cyan> <bg-white>
   */
  start() { return this; }
  end() {}
  trace(text) { return this.log(LogLevel.TRACE, text); }
  debug(text) { return this.log(LogLevel.DEBUG, text); }
  info(text) { return this.log(LogLevel.INFO, text); }
  warn(text) { return this.log(LogLevel.WARN, text); }
  error(text) { return this.log(LogLevel.ERROR, text); }
  fatal(text) { return this.log(LogLevel.FATAL, text); }
  log(level, text) { return this; }
  write(text) { return this; }
  heading(text) { return this; }
  paragraphBreak() { return this; }
  sectionBreak() { return this; }
  list() { return new List(this); }
  table(...columns) { return new Table(this, columns); }
  // TODO
}

class List {
  constructor(output) {
    assert(output instanceof RichOutput && output);
    this._output = output;
    if (new.target === List)
      this._start();
  }
  get output { return this._output; }
  item(text) {
    assert(this._output);
    _item(text);
    return this;
  }
  end() {
    if (this._output)
      this._end();
    this._output = null;
  }
  _start() {}
  _item() {}
  _end() {}
  // TODO
}

class Table {
  constructor(output, columns) {
    this._output = output;
    if (new.target === Table)
      this._start();
  }
  row(...values) { return this; }
  end() {}
  _start() {}
  _end() {}
  // TODO
}

class Splitter extends RichOutput {
  constructor(...outputs) {
    this._outputs = outputs;
  }
  // TODO
}

class LogLevelDemultiplexer extends RichOutput {
  constructor(output1, output2, threshold = LogLevel.WARN) {
    this._output1 = output1;
    this._output2 = output2;
  }
  // TODO
}

class TextOutput extends RichOutput {
  constructor(stream) {
    this._stream = stream;
  }
  // TODO
  // Configuration: include timestamp.
}

class HtmlOutput extends RichOutput {
  constructor(stream) {
    this._stream = stream;
  }
  // TODO
}

class ConsoleOutput extends RichOutput {
  constructor(console = undefined) {
    this._console = console;
  }
  // TODO
}

module.exports = {
  LogLevel,
  RichOutput,
  List,
  Table,
  Splitter,
  LogLevelDemultiplexer,
  TextOutput,
  HtmlOutput,
  ConsoleOutput,
};
