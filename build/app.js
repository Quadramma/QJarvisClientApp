(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function _utf16leWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = _asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = _binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = _base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = _asciiSlice(self, start, end)
      break
    case 'binary':
      ret = _binarySlice(self, start, end)
      break
    case 'base64':
      ret = _base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++)
      target[i + target_start] = this[i + start]
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function _utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\..\\..\\node_modules\\gulp-browserify\\node_modules\\browserify\\node_modules\\buffer\\index.js","/..\\..\\..\\node_modules\\gulp-browserify\\node_modules\\browserify\\node_modules\\buffer")
},{"base64-js":2,"buffer":1,"htZkx4":4,"ieee754":3}],2:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\..\\..\\node_modules\\gulp-browserify\\node_modules\\browserify\\node_modules\\buffer\\node_modules\\base64-js\\lib\\b64.js","/..\\..\\..\\node_modules\\gulp-browserify\\node_modules\\browserify\\node_modules\\buffer\\node_modules\\base64-js\\lib")
},{"buffer":1,"htZkx4":4}],3:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\..\\..\\node_modules\\gulp-browserify\\node_modules\\browserify\\node_modules\\buffer\\node_modules\\ieee754\\index.js","/..\\..\\..\\node_modules\\gulp-browserify\\node_modules\\browserify\\node_modules\\buffer\\node_modules\\ieee754")
},{"buffer":1,"htZkx4":4}],4:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\..\\..\\node_modules\\gulp-browserify\\node_modules\\browserify\\node_modules\\process\\browser.js","/..\\..\\..\\node_modules\\gulp-browserify\\node_modules\\browserify\\node_modules\\process")
},{"buffer":1,"htZkx4":4}],5:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
module.exports = angular.module('app.config', []);
//require('./config.js');
require('./routes.js');

}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\config\\_module_init.js","/..\\config")
},{"./routes.js":6,"buffer":1,"htZkx4":4}],6:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.config(function($stateProvider, $urlRouterProvider, $httpProvider) {
	delete $httpProvider.defaults.headers.common['X-Requested-With'];
	$urlRouterProvider.otherwise('/home'); //DEFAULT
});

module.run([
	'$QJHelperFunctions', '$QJLogger', '$QJApi', '$rootScope', '$location', '$urlRouter', '$state', '$timeout',
	function($QJHelperFunctions, $QJLogger, $QJApi, $rootScope, $location, $urlRouter, $state, $timeout) {

		$rootScope.$on('$stateChangeStart', function(event, toState, toParams, fromState, fromParams) {
			//
			var logged = $rootScope.session.token != null;
			if (toState.name != "login" && !logged) {
				$QJLogger.log('run -> state -> force redirection');
				event.preventDefault();
				$QJHelperFunctions.changeState('login');
			}
			//
		});

	}
]);

module.config(function($stateProvider, $urlRouterProvider, $httpProvider) {

console.info('[ROUTES]');

	$stateProvider
	.state('home', {
		url: '^/home',
		views: {
			'': {
				templateUrl: 'pages/home.html',
				controller: 'HomeController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})

	.state('login', {
		url: '^/login',
		views: {
			'': {
				templateUrl: 'pages/login.html',
				controller: 'LoginController'
			},
			'nav': {
				templateUrl: 'pages/empty_nav.html'
			},
			'sidebar': {
				templateUrl: 'pages/empty.html'
			}
		}
	})



	.state('error-response-has-errors', {
		url: '^/apierrorinvalidresponse',
		views: {
			'': {
				templateUrl: 'pages/errors/api.response.has.errors.html'
			},
			'nav': {
				templateUrl: 'pages/empty_nav.html'
			},
			'sidebar': {
				templateUrl: 'pages/empty.html'
			}
		}
	})

	.state('error-invalid-response', {
		url: '^/apierrorinvalidresponse',
		views: {
			'': {
				templateUrl: 'pages/errors/api.invalid.response.html'
			},
			'nav': {
				templateUrl: 'pages/empty_nav.html'
			},
			'sidebar': {
				templateUrl: 'pages/empty.html'
			}
		}
	})

	.state('error-api', {
		url: '^/apierror',
		views: {
			'': {
				templateUrl: 'pages/errors/api.html'
			},
			'nav': {
				templateUrl: 'pages/empty_nav.html'
			},
			'sidebar': {
				templateUrl: 'pages/empty.html'
			}
		}
	})


	//MENUS
	.state('module-menu-list', {
		url: '^/menus',
		views: {
			'': {
				templateUrl: 'pages/menu/menu.list.html',
				controller: 'MenuListController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})
		.state('module-menu-edit', {
			url: '^/menu/:id',
			views: {
				'': {
					templateUrl: 'pages/menu/menu.edit.html',
					controller: 'MenuEditController'
				},
				'nav': {
					templateUrl: 'pages/nav.html',
					controller: 'NavController'
				},
				'sidebar': {
					templateUrl: 'pages/sidebar.html',
					controller: 'SidebarController'
				}
			}
		})


	.state('module-profile-list', {
		url: '^/profiles',
		views: {
			'': {
				templateUrl: 'pages/profile/profile.list.html',
				controller: 'ProfileListController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})
		.state('module-profile-edit', {
			url: '^/profiles/:id',
			views: {
				'': {
					templateUrl: 'pages/profile/profile.edit.html',
					controller: 'ProfileEditController'
				},
				'nav': {
					templateUrl: 'pages/nav.html',
					controller: 'NavController'
				},
				'sidebar': {
					templateUrl: 'pages/sidebar.html',
					controller: 'SidebarController'
				}
			}
		})

	.state('module-usergroup-list', {
		url: '^/usergroups',
		views: {
			'': {
				templateUrl: 'pages/users/usergroup.list.html',
				controller: 'UsergroupListController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})
		.state('module-usergroup-edit', {
			url: '^/usergroups/:id',
			views: {
				'': {
					templateUrl: 'pages/users/usergroup.edit.html',
					controller: 'UsergroupEditController'
				},
				'nav': {
					templateUrl: 'pages/nav.html',
					controller: 'NavController'
				},
				'sidebar': {
					templateUrl: 'pages/sidebar.html',
					controller: 'SidebarController'
				}
			}
		})



	.state('module-user-list', {
		url: '^/users',
		views: {
			'': {
				templateUrl: 'pages/users/users.list.html',
				controller: 'UserListController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})
		.state('module-user-edit', {
			url: '^/user/:id',
			views: {
				'': {
					templateUrl: 'pages/users/users.edit.html',
					controller: 'UserEditController'
				},
				'nav': {
					templateUrl: 'pages/nav.html',
					controller: 'NavController'
				},
				'sidebar': {
					templateUrl: 'pages/sidebar.html',
					controller: 'SidebarController'
				}
			}
		})

	.state('module-user-myprofile-edit', {
		url: '^/myprofile/:id',
		views: {
			'': {
				templateUrl: 'pages/users/users.myprofile.edit.html',
				controller: 'UserEditController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})

	.state('module-project-list', {
		url: '^/project',
		views: {
			'': {
				templateUrl: 'pages/project/project.list.html',
				controller: 'ProjectListController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})
		.state('module-project-edit', {
			url: '^/project/:id',
			views: {
				'': {
					templateUrl: 'pages/project/project.edit.html',
					controller: 'ProjectEditController'
				},
				'nav': {
					templateUrl: 'pages/nav.html',
					controller: 'NavController'
				},
				'sidebar': {
					templateUrl: 'pages/sidebar.html',
					controller: 'SidebarController'
				}
			}
		})

	.state('module-project-hours-list', {
		url: '^/projecthours',
		views: {
			'': {
				templateUrl: 'pages/project/project.hours.list.html',
				controller: 'ProjectHoursListController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})
		.state('module-project-hours-edit', {
			url: '^/projecthours/:id',
			views: {
				'': {
					templateUrl: 'pages/project/project.hours.edit.html',
					controller: 'ProjectHoursEditController'
				},
				'nav': {
					templateUrl: 'pages/nav.html',
					controller: 'NavController'
				},
				'sidebar': {
					templateUrl: 'pages/sidebar.html',
					controller: 'SidebarController'
				}
			}
		})


	.state('module-settings', {
		url: '^/settings',
		views: {
			'': {
				templateUrl: 'pages/settings/qj.settings.html',
				controller: 'QJBackendSettingsController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})


	.state('module-vipster-settings', {
		url: '^/vipster/settings',
		views: {
			'': {
				templateUrl: 'pages/vipster/vipster.settings.html',
				controller: 'VipsterConfigController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})

	.state('module-chat', {
		url: '^/chat',
		views: {
			'': {
				templateUrl: 'pages/chat/chat.main.html',
				controller: 'ChatController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})



	;
});
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\config\\routes.js","/..\\config")
},{"./_module_init.js":5,"buffer":1,"htZkx4":4}],7:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
module.exports = angular.module('app.controllers', ['app.controls']);
require('./appCtrl.js');
require('./chatCtrl.js');
require('./homeCtrl.js');
require('./loginCtrl.js');
require('./mod.menuCtrl.js');
require('./mod.profileCtrl.js');
require('./mod.projecthoursCtrl.js');
require('./mod.projectsCtrl.js');
require('./mod.usergroupCtrl.js');
require('./mod.usersCtrl.js');
require('./navCtrl.js');
require('./settingsCtrl.js');
require('./sidebarCtrl.js');
require('./vp.configCtrl.js');
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controllers\\_module_init.js","/..\\controllers")
},{"./appCtrl.js":8,"./chatCtrl.js":9,"./homeCtrl.js":10,"./loginCtrl.js":11,"./mod.menuCtrl.js":12,"./mod.profileCtrl.js":13,"./mod.projecthoursCtrl.js":14,"./mod.projectsCtrl.js":15,"./mod.usergroupCtrl.js":16,"./mod.usersCtrl.js":17,"./navCtrl.js":18,"./settingsCtrl.js":19,"./sidebarCtrl.js":20,"./vp.configCtrl.js":21,"buffer":1,"htZkx4":4}],8:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.controller('AppController', function(
	$QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {
	$QJLogger.log("AppController -> initialized");
	//$QJHelperFunctions.checkAPIAndGoToApiErrorStateIfThereIsAProblem();
	$QJHelperFunctions.checkTokenExpirationAndGoToLoginStateIfHasExpired();
});
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controllers\\appCtrl.js","/..\\controllers")
},{"./_module_init.js":7,"buffer":1,"htZkx4":4}],9:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.controller('ChatController', function(
	$QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {
	$QJLogger.log("ChatController -> initialized");


	$scope.breadcrumb = {
		name: 'Chat',
		list: [
			//{name:'None2',state:'',fa:'fa-dashboard'}
		],
		active: "Chat"
	};


	$scope.input = "";
	$scope.items = [{
		sender: "Pepe",
		message: "Blabla"
	}, {
		sender: "Pepe 2",
		message: "Blabla"
	}];



	/*
		var obj = JSON.parse(e.data);
		console.info(obj);
		$timeout(function(){
			$scope.$apply(function(){
				$scope.items.push(obj);
			});
		});
	*/


	$scope.enter = function() {
		var newItem = {
			loginname: $rootScope.session.loginname,
			message: $scope.input
		};
		$scope.items.unshift(newItem);
		$scope.input = "";
		//
		$QJApi.getController('chat').post({
			action: 'save'
		}, {
			message: newItem.message,
			_chat_id: 1
		}, function(res) {
			$QJLogger.log("ChatController -> POST chat save -> success");
			update();
		});
	};



	function update() {
		$QJApi.getController('chat').get({
			action: 'list'
		}, function(res) {
			$QJLogger.log("ChatController -> GET chat list -> success");
			$scope.items = _.sortBy(res.items, function(item) {
				return item._id * -1;
			});
			console.info(res.items);
		});
	}
	update();

	var myVar = setInterval(update, 5000);

	$rootScope.$on('$stateChangeStart',
		function(event, toState, toParams, fromState, fromParams) {

			if (fromState.name === "module-chat") {
				clearInterval(myVar);
			}

		});

})

}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controllers\\chatCtrl.js","/..\\controllers")
},{"./_module_init.js":7,"buffer":1,"htZkx4":4}],10:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.controller('HomeController', function(
	$QJAuth, $QJCCombobox, $QJLogger, $scope, $rootScope, $QJLoginModule, $QJLocalSession, $QJConfig, $QJApi) {
	$QJLogger.log("HomeController -> initialized");

	$scope.breadcrumb = {
		name: 'Dashboard',
		list: [
			//{name:"None1",state:'module-project-list',fa:'fa-dashboard'},
			//{name:'None2',state:'',fa:'fa-dashboard'}
		],
		active: "Dashboard"
	};


});
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controllers\\homeCtrl.js","/..\\controllers")
},{"./_module_init.js":7,"buffer":1,"htZkx4":4}],11:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.controller('LoginController', function(
    $QJLogger,
    $scope, $rootScope, $QJLoginModule, $timeout, $QJHelperFunctions) {
    $QJLogger.log('LoginController');

    $scope.loginnameRequired = false;
    $scope.passwordRequired = false;

    setTimeout(function() {
        $rootScope.error = {
            message: ""
        };
    }, 4000);


    $scope.classForPassword = function() {
        return 'form-group ' + ($scope.passwordRequired ? 'has-error' : '');
    };

    $scope.invalidCredentials = function() {
        console.info("[QJarvisAppLoginController]->[InvalidCredentials]");
        $scope.showError("Credenciales invalidas");
    };

    $scope.showError = function(errorMessage) {
        $rootScope.error = {
            message: errorMessage
        };
        setTimeout(function() {
            $rootScope.message = '';
        }, 5000);
    };

    $scope.validateFields = function(success) {
        if (_.isUndefined($scope.loginname) || $scope.loginname == "") {
            console.info("[]->[loginname required]");
            $scope.showError("Usuario requerido");
        } else {
            if (_.isUndefined($scope.password) || $scope.password == "") {
                console.info("[]->[password required]");
                $scope.showError("Password requerida");
            } else {
                success();
            }
        }
    };

    $scope.submit = function() {
        $scope.validateFields(function() {
            $QJLoginModule.login($scope.loginname, $scope.password, function() {
                $QJHelperFunctions.changeState('home');
            });
        });
    };
});
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controllers\\loginCtrl.js","/..\\controllers")
},{"./_module_init.js":7,"buffer":1,"htZkx4":4}],12:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.controller('MenuListController', function(
    $QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {
    $QJLogger.log("MenuListController -> initialized");



    $scope.breadcrumb = {
        name: 'Menu Editor',
        list: [
            //{name:"None1",state:'module-project-list',fa:'fa-dashboard'},
            //{name:'None2',state:'',fa:'fa-dashboard'}
        ],
        active: "Menu Editor"
    };

    $scope.menuArr = []; //holds items from db
    $scope.menuData = null; //holds items divided per page

    //filter
    $QJCFilter.create({
        name: 'menuFilter',
        fields: [{
            name: 'description',
            arrayName: 'menuArr',
            bindTo: ['description']
        }, {
            name: '_profile_id',
            arrayName: 'menuArr',
            bindTo: ['_profile_id']
        }, {
            name: '_group_id',
            arrayName: 'menuArr',
            bindTo: ['_group_id']
        }]
    }, $scope);

    function loadControls() {
        //combobox
        $QJCCombobox.create({
            name: 'profileCBO',
            label: "Profile",
            code: -1,
            code_copyto: 'menuFilter.fields._profile_id',
            api: {
                controller: 'profile',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
        //combobox
        $QJCCombobox.create({
            name: 'groupCBO',
            label: "Implementation group",
            code: -1,
            code_copyto: 'menuFilter.fields._group_id',
            api: {
                controller: 'group',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
        //listview
        $QJCListview.create({
            name: 'menuLVW',
            dataArray: 'menuArr',
            pagedDataArray: 'menuData',
            api: {
                controller: 'menu',
                params: {
                    action: 'combobox_all'
                }
            },
            columns: [{
                    name: 'description',
                    label: 'Description'
                }
                //{name:'first_name',label:'First name'},
                //{name:'_profile_id',label:'Last name'}
            ],
            itemClick: function(item) {
                $QJHelperFunctions.changeState('module-menu-edit', {
                    id: item._id
                });
            }
        }, $scope);
    }


    //Load controls when current item its avaliable.
    var controlsLoaded = false;
    $rootScope.$on('currentUser.change', function() {
        loadControls();
        controlsLoaded = true;
    });
    if (!controlsLoaded && !_.isUndefined($rootScope.currentUser)) {
        loadControls();
        controlsLoaded = true;
    }
    //defaults
    $timeout(function() {
        $scope.menuFilter.filter();
    }, 2000);
})



module.controller('MenuEditController', function(
    $QJCCombobox, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {
    $QJLogger.log("MenuEditController -> initialized");

    var _menu_id = $state.params.id;

    $scope.crud = {
        errors: []
    }

    function showError(error) {
        $scope.crud.errors.push(error);
        return true;
    }

    function formHasErrors() {
        $scope.crud.errors = [];
        var hasErrors = false;
        if (_.isUndefined($scope.item.description) || $scope.item.description == '') {
            hasErrors = showError('Description required');
        }
        if (_.isUndefined($scope.item._group_id) || $scope.item._group_id == '') {
            hasErrors = showError('Group required');
        }
        if (_.isUndefined($scope.item._profile_id) || $scope.item._profile_id == '') {
            hasErrors = showError('Profile required');
        }
        return hasErrors;
    }

    $scope.save = function() {
        if (!formHasErrors()) {
            $QJApi.getController('menu').post({
                action: 'save'
            }, $scope.item, function(res) {
                $QJLogger.log("MenuEditController -> api post -> menu save -> success");
                //
                showError('Cambios guardados');
            });
        };
    };
    $scope.cancel = function() {
        $QJHelperFunctions.changeState('module-menu-list');
    };


    function loadControls() {
        //combobox
        $QJCCombobox.create({
            name: 'groupCBO',
            label: "Implementation group",
            code: $scope.item._group_id,
            code_copyto: 'item._group_id',
            api: {
                controller: 'group',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
        //combobox
        $QJCCombobox.create({
            name: 'profileCBO',
            label: "Profile",
            code: $scope.item._profile_id,
            code_copyto: 'item._profile_id',
            api: {
                controller: 'profile',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
    }



    //GET SINGLE USER
    $QJApi.getController('menu').get({
        action: 'single',
        id: _menu_id
    }, function(res) {
        $QJLogger.log("MenuEditController -> api get -> menu single -> success");
        $scope.item = res.items[0] || null;
        loadControls();
    });


});


;
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controllers\\mod.menuCtrl.js","/..\\controllers")
},{"./_module_init.js":7,"buffer":1,"htZkx4":4}],13:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');




module.controller('ProfileListController', function(
	$QJCCombobox, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {

	$QJLogger.log("ProfileListController -> initialized");
	$scope.breadcrumb = {
		name: 'Profiles',
		list: [],
		active: "Profiles"
	};
	$scope.items = []; //holds items from db
	$scope.lvwData = null; //holds items divided per page

	//filter
	$QJCFilter.create({
		name: 'filter',
		fields: [{
			name: 'description',
			arrayName: 'items',
			bindTo: ['description']
		}]
	}, $scope);

	function loadControls() {
		//listview
		$QJCListview.create({
			name: 'lvw',
			dataArray: 'items',
			pagedDataArray: 'lvwData',
			api: {
				controller: 'profile',
				params: {
					action: 'combobox_all'
				}
			},
			columns: [{
				name: 'description',
				label: 'Description'
			}],
			itemClick: function(item) {
				$QJHelperFunctions.changeState('module-profile-edit', {
					id: item._id
				});
			}
		}, $scope);
	}


	//Load controls when current item its avaliable.
	var controlsLoaded = false;
	$rootScope.$on('currentUser.change', function() {
		loadControls();
		controlsLoaded = true;
	});
	if (!controlsLoaded && !_.isUndefined($rootScope.currentUser)) {
		loadControls();
		controlsLoaded = true;
	}
	//defaults
	$timeout(function() {
		$scope.filter.filter();
	}, 2000);
})

module.controller('ProfileEditController', function(
	$QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {
	$scope.id = $state.params.id;
	var _id = $state.params.id;
	var action = ((_id.toString() === '-1')?'New':'Edit');
	$QJLogger.log("ProfileEditController -> initialized");
	$scope.breadcrumb = {
		name: 'Profile '+action,
		list: [{
			name: "Profiles",
			state: 'module-profile-list',
			//fa: 'fa-dashboard'
		}, ],
		active: action
	};

	$scope.enableDelete = function(){
		return $scope.id && $scope.id.toString() != '-1';
	};

	

	$scope.crud = {
		errors: []
	}

	function showError(error) {
		$scope.crud.errors.push(error);
		return true;
	}

	function formHasErrors() {
		$scope.crud.errors = [];
		var hasErrors = false;
		if (_.isUndefined($scope.item.description) || $scope.item.description == '') {
			hasErrors = showError('Description required');
		}
		return hasErrors;
	}

	$scope.save = function() {
		if (!formHasErrors()) {
			$QJApi.getController('profile').post({
				action: 'save'
			}, $scope.item, function(res) {
				$QJLogger.log("ProfileEditController -> api post -> save -> success");
				//
				showError('Cambios guardados');
				$QJHelperFunctions.changeState('module-profile-list',{},500);
			});
		};
	};
	$scope.delete = function() {
		var r = confirm("Delete " + $scope.item.description + " ?");
		if (r == true) {
			$QJApi.getController('profile').post({
				action: 'delete'
			}, $scope.item, function(res) {
				$QJLogger.log("ProfileEditController -> delete -> success");
				//
				showError('Cambios guardados');
				showError($scope.item.description + ' eliminado');
				//
				$QJHelperFunctions.changeState('module-profile-list',{},500);

				create();
			});
		} else {}
	}
	$scope.cancel = function() {
		$QJHelperFunctions.changeState('module-profile-list');
	};

	function loadControls() {}

	function create() {
		$QJLogger.log("ProfileEditController -> create new!");
		$scope.item = {
			description: '',
			_id: -1
		};
	}
	if (_id == -1) {
		//CREATE
		create();
		loadControls();
	} else {
		//GET SINGLE USER
		$QJApi.getController('profile').get({
			action: 'single',
			id: _id
		}, function(res) {
			$QJLogger.log("ProfileEditController -> api get -> single -> success");
			$scope.item = res.item;
			$scope.breadcrumb.active = $scope.item.description;
			loadControls();
		});
	}

});


}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controllers\\mod.profileCtrl.js","/..\\controllers")
},{"./_module_init.js":7,"buffer":1,"htZkx4":4}],14:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.controller('ProjectHoursListController', function(
    $QJLocalSession, $QJCTimeCounter, $interval, $QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {
    $QJLogger.log("ProjectListController -> initialized");


    $scope.breadcrumb = {
        name: 'Projects Hours',
        list: [{
            name: 'Projects',
            state: 'module-project-list',
            //fa: 'fa-dashboard'
        }],
        active: "Projects Hours"
    };


    g.ProjectListController = $scope;

    $scope.items = []; //holds projects from db
    $scope.itemsData = null; //holds projects divided per page

    //filter
    $QJCFilter.create({
        name: 'projecthoursFilter',
        fields: [{
            name: 'loginname',
            arrayName: 'items',
            bindTo: ['loginname']
        }, {
            name: '_id_company',
            arrayName: 'items',
            bindTo: ['_id_company']
        }, {
            name: '_id_project',
            arrayName: 'items',
            bindTo: ['_id_project']
        }, {
            name: '_id_user',
            arrayName: 'items',
            bindTo: ['_id_user']
        }]
    }, $scope);


    function loadControls() {

        //--------
        //combobox
        $QJCCombobox.create({
            name: 'hourscompanyCBO',
            label: "Company",
            code: $rootScope.session.projecthours_hourscompanyCBOCODE || -1, //$rootScope.currentUser._group_id,
            code_copyto: 'hoursprojectCBO.api.params._id_company',
            //description_copyto: 'current.company',
            api: {
                controller: 'company',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
        //combobox
        $QJCCombobox.create({
            name: 'hoursprojectCBO',
            label: "Project",
            code: $rootScope.session.projecthours_hoursprojectCBOCODE || -1, //$rootScope.currentUser._group_id,
            code_copyto: 'current.item._id_project',
            description_copyto: 'current.project',
            api: {
                controller: 'project',
                params: {
                    action: 'combobox_all',
                    _id_company: $scope.hourscompanyCBO.code || -1
                }
            },
        }, $scope)
        //--------


        //combobox
        $QJCCombobox.create({
            name: 'companyCBO',
            label: "Company",
            code: -1, //$rootScope.currentUser._group_id,
            code_copyto: 'projecthoursFilter.fields._id_company',
            api: {
                controller: 'company',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
        //combobox
        $QJCCombobox.create({
            name: 'projectCBO',
            label: "Project",
            code: -1, //$rootScope.currentUser._group_id,
            code_copyto: 'projecthoursFilter.fields._id_project',
            api: {
                controller: 'project',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
        //combobox
        $QJCCombobox.create({
            name: 'userCBO',
            label: "User",
            code: -1, //$rootScope.currentUser._group_id,
            code_copyto: 'projecthoursFilter.fields._id_user',
            api: {
                controller: 'user',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);



        //listview
        $QJCListview.create({
            name: 'projectshoursLVW',
            dataArray: 'items',
            pagedDataArray: 'itemsData',
            api: {
                controller: 'project',
                params: {
                    action: 'hours_all',
                    _id_project: -1
                }
            },
            columns: [{
                name: 'loginname',
                label: 'User'
            }, {
                name: 'differenceFormated',
                label: 'Tiempo (hms)'
            }, {
                name: 'startFormated',
                label: 'Start'
            }, {
                name: 'endFormated',
                label: 'End'
            }],
            itemClick: function(item) {
                $QJHelperFunctions.changeState('module-project-hours-edit', {
                    id: item._id
                });
            }
        }, $scope);

        $scope.$on("projectshoursLVW.update", function() {
            //console.info("projectshoursLVW.update");
            $scope.items = _.each($scope.items, function(item) {
                var diff = item.difference;
                var duration = {
                    hours: Math.round((diff / 1000 / 60 / 60) % 24),
                    minutes: Math.round((diff / 1000 / 60) % 60),
                    seconds: Math.round((diff / 1000) % 60)
                };
                var str = "";
                str += duration.hours + ":";
                str += duration.minutes + ":";
                str += duration.seconds + "";
                item.differenceFormated = str;
                item.startFormated = moment(parseInt(item.start)).format("DD-MM-YY h:mm:ss a");
                item.endFormated = moment(parseInt(item.end)).format("DD-MM-YY h:mm:ss a");
            });
            //$QJLogger.log("projectshoursLVW.update");
        });



    }



    $QJCTimeCounter.create({
        name: 'current',
        api: {
            controller: 'project',
            params: {
                action: 'hours_current',
                _id_project: -1
            }
        },
        onInit: function(self) {
            if (_.isUndefined(self.resitem) || _.isNull(self.resitem)) {
                self.item = {
                    _id: -1,
                    _id_project: $scope.hoursprojectCBO.code,
                    _id_user: null, //save current based on token.
                    start: null,
                    end: null,
                    difference: null
                };
            } else {
                self.item = self.resitem;
                self.resume(self.item.start);
            }
        },
        onStartChange: function(newVal, self) {
            self.item.start = newVal;
        },
        onStopChange: function(newVal, self) {
            self.item.end = newVal;
        },
        onDiffChange: function(newVal, newValFormated, self) {
            self.item.difference = newVal;
        },
        onValidateStart: function(self) {
            var val = !_.isUndefined(self.item) && !_.isUndefined(self.item._id_project) && self.item._id_project != null && self.item._id_project != "";
            if (!val) {
                self.errors = [];
                self.addError("Project required");
            }
            return val;
        },
        onStartClick: function(self) {
            $scope.hourscompanyCBO.disabled = true;
            $scope.hoursprojectCBO.disabled = true;
            //
            $QJApi.getController("project").post({
                action: 'hours_save'
            }, self.item, function(res) {
                $QJLogger.log("hours -> save -> success");
            });
        },
        onStopClick: function(self) {
            $scope.hourscompanyCBO.disabled = false;
            $scope.hoursprojectCBO.disabled = false;
            //
            $QJApi.getController("project").post({
                action: 'hours_save'
            }, self.item, function(res) {
                $QJLogger.log("hours -> save -> success");
                self.addError("Duration: " + $QJHelperFunctions.getTimestampDuration(self.item.difference));
                self.addError("Timestamp saved");
                $scope.projectshoursLVW.update();
                $scope.$emit('project.update', {
                    initializeTimer: false
                });
            });
            //

            if ($scope.projectinfo) {
                $scope.projectinfo.show = false;
            }
        }
    }, $scope); //.init();
    $scope.$on('hoursprojectCBO.change', function() {
        $scope.$emit('project.update', {
            initializeTimer: true
        });
    });

    $scope.$on('project.update', function(arg, params) {

        //stores company,project
        $rootScope.session.projecthours_hourscompanyCBOCODE = $scope.hourscompanyCBO.code;
        $rootScope.session.projecthours_hoursprojectCBOCODE = $scope.hoursprojectCBO.code;
        $QJLocalSession.save();


        var _id_project = $scope.hoursprojectCBO.code; //UPDATE INFORMATION ABOUT PROJECT HOURS
        if (_id_project != -1) {
            updateProjectInfo(_id_project);

            if (params.initializeTimer) {
                $scope.current.api.params._id_project = _id_project; //ifa prj its selected. Update timer status
                $scope.current.init();
            }
        }

    });

    function updateProjectInfo(_id_project) {
        $QJApi.getController("project").get({
            action: "hours_all",
            _id_project: _id_project.toString()
        }, function(res) {
            $QJLogger.log("project hours_all -> success");
            var hours = [];
            _.each(res.items, function(item) {
                var exists = !_.isUndefined(_.find(hours, function(infoItem) {
                    return infoItem.loginname == item.loginname;
                }));

                if (item.end == null) exists = true; //
                if (exists) return;
                var hoursfrom = _.filter(res.items, function(i) {
                    return i.loginname == item.loginname;
                });
                var diff = 0;
                _.each(hoursfrom, function(i) {
                    diff += parseInt(i.difference);
                });

                hours.push({
                    loginname: item.loginname,
                    diff: diff,
                    diffFormated: $QJHelperFunctions.getTimestampDuration(diff)
                });
            });
            //console.info(info);
            var hoursTotal = 0;
            _.each(hours, function(i) {
                hoursTotal += parseInt(i.diff);
            });
            $scope.projectinfo = {
                hours: hours,
                hoursTotal: hoursTotal,
                hoursTotalFormated: $QJHelperFunctions.getTimestampDuration(hoursTotal),
                show: true
            };
            //console.info($scope.projectinfo);
        });
    }

    //Load controls when current user its avaliable.
    var controlsLoaded = false;
    $rootScope.$on('currentUser.change', function() {
        loadControls();
        controlsLoaded = true;
    });
    if (!controlsLoaded && !_.isUndefined($rootScope.currentUser)) {
        loadControls();
        controlsLoaded = true;
    }

    //defaults
    $timeout(function() {
        $scope.projecthoursFilter.filter();
    }, 2000);


    scope = $scope;

})



module.controller('ProjectHoursEditController', function(
    $QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {


    $QJLogger.log("ProjectHoursEditController -> initialized");


    $scope.breadcrumb = {
        name: 'Project Hours',
        list: [{
            name: 'Projects Hours',
            state: 'module-project-hours-list',
            //fa: 'fa-dashboard'
        }],
        active: "Loading"
    };


    var _id = $state.params.id;

    $scope.crud = {
        errors: []
    }

    function showError(error) {
        $scope.crud.errors.push(error);
        return true;
    }

    function formHasErrors() {
        $scope.crud.errors = [];
        var hasErrors = false;
        if (_.isUndefined($scope.item.start) || $scope.item.start == '') {
            hasErrors = showError('Start required');
        }
        if (_.isUndefined($scope.item.end) || $scope.item.end == '') {
            hasErrors = showError('End required');
        }
        return hasErrors;
    }

    $scope.save = function() {
        if (!formHasErrors()) {
            $QJApi.getController('project').post({
                action: 'hours_save'
            }, $scope.item, function(res) {
                $QJLogger.log("ProjectHoursEditController -> -> project hours_save -> success");
                //
                showError('Cambios guardados');
            });
        };
    };
    $scope.cancel = function() {
        $QJHelperFunctions.changeState('module-project-hours-list');
    };
    $scope.delete = function() {
        var r = confirm("Delete [" + $scope.item.start + " - " + $scope.item.end + "] ?");
        if (r == true) {
            $QJApi.getController('project').post({
                action: 'hours_delete'
            }, $scope.item, function(res) {
                $QJLogger.log("ProjectHoursEditController -> project delete -> success");
                //
                showError('Cambios guardados');
                showError($scope.item.name + ' eliminado');

                $timeout(function() {
                    $QJHelperFunctions.changeState('module-project-hours-list');
                }, 500);

            });
        } else {}
    }


    function create() {
        $QJLogger.log("ProjectHoursEditController -> create new!");
        $scope.item = {
            _id: -1,
            _id_project: '',
            _id_user: '',
            start: '',
            end: '',
            milliseconds: '',
        };
    }

    function loadControls() {


    }

    if (_id == -1) {
        //CREATE
        //create();
        loadControls();
    } else {
        //UPDATE
        $QJApi.getController('project').get({
            action: 'hours_single',
            id: _id
        }, function(res) {
            $QJLogger.log("ProjectHoursEditController -> project hours_single -> success");
            //console.info(res.item);
            $scope.item = res.item;
            $scope.breadcrumb.active = $scope.item.userName + "'s Timestamp";
            loadControls();
        });

    }
});
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controllers\\mod.projecthoursCtrl.js","/..\\controllers")
},{"./_module_init.js":7,"buffer":1,"htZkx4":4}],15:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.controller('ProjectListController', function(
    $QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {

    $QJLogger.log("ProjectListController -> initialized");


    $scope.breadcrumb = {
        name: 'Projects',
        list: [
            //{name:'None2',state:'',fa:'fa-dashboard'}
        ],
        active: "Projects"
    };

    $scope.projects = []; //holds projects from db
    $scope.projectsData = null; //holds projects divided per page

    //filter
    $QJCFilter.create({
        name: 'projectsFilter',
        fields: [{
            name: 'name',
            arrayName: 'projects',
            bindTo: ['name']
        }, {
            name: 'description',
            arrayName: 'projects',
            bindTo: ['description']
        }, {
            name: '_id_company',
            arrayName: 'projects',
            bindTo: ['_id_company']
        }]
    }, $scope);


    function loadControls() {
        //combobox
        $QJCCombobox.create({
            name: 'companyCBO',
            label: "Company",
            code: -1, //$rootScope.currentUser._group_id,
            code_copyto: 'projectsFilter.fields._id_company',
            api: {
                controller: 'company',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
        //listview
        $QJCListview.create({
            name: 'projectsLVW',
            dataArray: 'projects',
            pagedDataArray: 'projectsData',
            api: {
                controller: 'project',
                params: {
                    action: 'all',
                    _id_company: -1
                }
            },
            columns: [{
                name: 'name',
                label: 'Name'
            }, {
                name: 'description',
                label: 'Description'
            }, {
                name: 'companyDescription',
                label: 'Company'
            }],
            itemClick: function(item) {
                $QJHelperFunctions.changeState('module-project-edit', {
                    id: item._id
                });
            }
        }, $scope);
    }


    //Load controls when current user its avaliable.
    var controlsLoaded = false;
    $rootScope.$on('currentUser.change', function() {
        loadControls();
        controlsLoaded = true;
    });
    if (!controlsLoaded && !_.isUndefined($rootScope.currentUser)) {
        loadControls();
        controlsLoaded = true;
    }

    //defaults
    $timeout(function() {
        $scope.projectsFilter.filter();
    }, 2000);

})

module.controller('ProjectEditController', function(
    $QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {

    $QJLogger.log("ProjectEditController -> initialized");

    $scope.id = $state.params.id;
    var _project_id = $state.params.id;
    var action = (($scope.id.toString() === '-1')?'New':'Edit');

    $scope.breadcrumb = {
        name: 'Project',
        list: [{
            name: 'Projects',
            state: 'module-project-list',
            //fa: 'fa-dashboard'
        }],
        active: action
    };




    $scope.enableDelete = function(){
        return $scope.id && $scope.id.toString() != '-1';
    };

    $scope.crud = {
        errors: []
    }

    function showError(error) {
        $scope.crud.errors.push(error);
        return true;
    }

    function formHasErrors() {
        $scope.crud.errors = [];
        var hasErrors = false;
        if (_.isUndefined($scope.item.name) || $scope.item.name == '') {
            hasErrors = showError('Name required');
        }
        /*
        if (_.isUndefined($scope.item.description) || $scope.item.description == '') {
            hasErrors = showError('First name required');
        }
        */
        if (_.isUndefined($scope.item._id_company) || $scope.item._id_company == '') {
            hasErrors = showError('Company required');
        }
        return hasErrors;
    }

    $scope.save = function() {
        if (!formHasErrors()) {
            $QJApi.getController('project').post({
                action: 'save'
            }, $scope.item, function(res) {
                $QJLogger.log("ProjectEditController -> -> project save -> success");
                //
                showError('Cambios guardados');
            });
        };
    };
    $scope.cancel = function() {
        $QJHelperFunctions.changeState('module-project-list');
    };
    $scope.delete = function() {
        var r = confirm("Delete " + $scope.item.name + " ?");
        if (r == true) {
            $QJApi.getController('project').post({
                action: 'delete'
            }, $scope.item, function(res) {
                $QJLogger.log("ProjectEditController -> project delete -> success");
                //
                showError('Cambios guardados');
                showError($scope.item.name + ' eliminado');

                $timeout(function() {
                    $QJHelperFunctions.changeState('module-project-list');
                }, 500);

                create();
            });
        } else {}
    }


    function create() {
        $QJLogger.log("ProjectEditController -> create new!");
        $scope.item = {
            name: '',
            description: '',
            _id_company: '',
            _id: -1
        };
    }

    function loadControls() {
        //combobox
        $QJCCombobox.create({
            name: 'companyCBO',
            label: "Company",
            code: $scope.item._id_company,
            code_copyto: 'item._id_company',
            api: {
                controller: 'company',
                params: {
                    action: 'combobox_all'
                }
            },
        }, $scope);
    }

    if (_project_id == -1) {
        //CREATE
        create();
        loadControls();
    } else {
        //UPDATE
        $QJApi.getController('project').get({
            action: 'single',
            id: _project_id
        }, function(res) {
            $QJLogger.log("ProjectEditController -> project single -> success");
            console.info(res.item);
            $scope.item = res.item;

            $scope.breadcrumb.active = $scope.item.name;

            loadControls();
        });

    }

});


;
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controllers\\mod.projectsCtrl.js","/..\\controllers")
},{"./_module_init.js":7,"buffer":1,"htZkx4":4}],16:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.controller('UsergroupListController', function(
	$QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {

	$QJLogger.log("UsergroupListController -> initialized");
	$scope.breadcrumb = {
		name: 'Usergroups',
		list: [],
		active: "Usergroups"
	};
	$scope.items = []; //holds items from db
	$scope.lvwData = null; //holds items divided per page

	//filter
	$QJCFilter.create({
		name: 'filter',
		fields: [{
			name: 'description',
			arrayName: 'items',
			bindTo: ['description']
		}, {
			name: '_id_profile',
			arrayName: 'items',
			bindTo: ['_id_profile']
		}]
	}, $scope);

	function loadControls() {
		//combobox
		$QJCCombobox.create({
			name: 'profileCBO',
			label: "Profile",
			code: -1,
			code_copyto: 'filter.fields._id_profile',
			api: {
				controller: 'profile',
				params: {
					action: 'combobox_all'
				}
			},
		}, $scope);
		//listview
		$QJCListview.create({
			name: 'lvw',
			dataArray: 'items',
			pagedDataArray: 'lvwData',
			api: {
				controller: 'usergroup',
				params: {
					action: 'lvwdata'
				}
			},
			columns: [{
				name: 'description',
				label: 'Description'
			}, {
				name: 'profileDescription',
				label: 'Profile'
			}],
			itemClick: function(item) {
				$QJHelperFunctions.changeState('module-usergroup-edit', {
					id: item._id
				});
			}
		}, $scope);
	}


	//Load controls when current item its avaliable.
	var controlsLoaded = false;
	$rootScope.$on('currentUser.change', function() {
		loadControls();
		controlsLoaded = true;
	});
	if (!controlsLoaded && !_.isUndefined($rootScope.currentUser)) {
		loadControls();
		controlsLoaded = true;
	}
	//defaults
	$timeout(function() {
		$scope.filter.filter();
	}, 2000);
})

module.controller('UsergroupEditController', function(
	$QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {

	$QJLogger.log("UsergroupEditController -> initialized");
	$scope.breadcrumb = {
		name: 'Usergroup Edit',
		list: [{
			name: "Usergroups",
			state: 'module-usergroup-list',
			//fa: 'fa-dashboard'
		}, ],
		active: "Loading..."
	};



	var _id = $state.params.id;

	$scope.crud = {
		errors: []
	}

	function showError(error) {
		$scope.crud.errors.push(error);
		return true;
	}

	function formHasErrors() {
		$scope.crud.errors = [];
		var hasErrors = false;
		if (_.isUndefined($scope.item.description) || $scope.item.description == '') {
			hasErrors = showError('Description required');
		}
		if (_.isUndefined($scope.item._id_profile) || $scope.item._id_profile == '') {
			hasErrors = showError('Profile required');
		}
		return hasErrors;
	}

	$scope.save = function() {
		if (!formHasErrors()) {
			$QJApi.getController('usergroup').post({
				action: 'save'
			}, $scope.item, function(res) {
				$QJLogger.log("UsergroupEditController -> api post -> save -> success");
				//
				showError('Cambios guardados');
				$QJHelperFunctions.changeState('module-usergroup-list', {}, 500);
			});
		};
	};
	$scope.delete = function() {
		var r = confirm("Delete " + $scope.item.name + " ?");
		if (r == true) {
			$QJApi.getController('usergroup').post({
				action: 'delete'
			}, $scope.item, function(res) {
				$QJLogger.log("UsergroupEditController -> delete -> success");
				//
				showError('Cambios guardados');
				showError($scope.item.description + ' eliminado');
				//
				$QJHelperFunctions.changeState('module-usergroup-list', {}, 500);

				create();
			});
		} else {}
	}
	$scope.cancel = function() {
		$QJHelperFunctions.changeState('module-usergroup-list');
	};

	function loadControls() {

		//combobox
		$QJCCombobox.create({
			name: 'profileCBO',
			label: "Profile",
			code: $scope.item._id_profile,
			code_copyto: 'item._id_profile',
			api: {
				controller: 'profile',
				params: {
					action: 'combobox_all'
				}
			},
		}, $scope);

	}

	function create() {
		$QJLogger.log("UsergroupEditController -> create new!");
		$scope.item = {
			description: '',
			_id_profile: '',
			_id: -1
		};
	}
	if (_id == -1) {
		//CREATE
		create();
		loadControls();
	} else {
		//GET SINGLE USER
		$QJApi.getController('usergroup').get({
			action: 'single',
			id: _id
		}, function(res) {
			$QJLogger.log("UsergroupEditController -> api get -> single -> success");
			$scope.item = res.item;
			$scope.breadcrumb.active = $scope.item.description;
			loadControls();
		});
	}

});

;
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controllers\\mod.usergroupCtrl.js","/..\\controllers")
},{"./_module_init.js":7,"buffer":1,"htZkx4":4}],17:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.controller('UserListController', function(
    $QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {



    $QJLogger.log("UserListController -> initialized");



    $scope.breadcrumb = {
        name: 'Users',
        list: [
            //{name:"None1",state:'module-project-list',fa:'fa-dashboard'},
            //{name:'None2',state:'',fa:'fa-dashboard'}
        ],
        active: "Users"
    };


    //console.info($rootScope.config);

    $scope.users = []; //holds users from db
    $scope.usersData = null; //holds users divided per page

    //filter
    $QJCFilter.create({
        name: 'usersFilter',
        fields: [{
            name: 'loginname',
            arrayName: 'users',
            bindTo: ['loginname']
        }, {
            name: 'text',
            arrayName: 'users',
            bindTo: ['first_name', 'last_name']
        }, {
            name: '_usergroup_id',
            arrayName: 'users',
            bindTo: ['_usergroup_id']
        }]
    }, $scope);

    /*
    //selectkey
    $QJCSelectkey.create({
        name: 'usersUsergroupSLK',
        label: "Usergroup",
        code: 7,
        text: "No disponible",
        code_copyto: 'usersFilter.fields._usergroup_id',
        search: function() {
            console.info('grupo de usuario lick')
        }
    }, $scope);
*/

    function loadControls() {


        //combobox
        $QJCCombobox.create({
            name: 'usersUsergroupCBO',
            label: "Usergroup",
            code: -1, //$rootScope.currentUser._group_id,
            code_copyto: 'usersFilter.fields._usergroup_id',
            api: {
                controller: 'usergroup',
                params: {
                    action: 'combobox'
                }
            },
        }, $scope);
        //listview
        $QJCListview.create({
            name: 'usersLVW',
            dataArray: 'users',
            pagedDataArray: 'usersData',
            api: {
                controller: 'user',
                params: {
                    action: 'all'
                }
            },
            columns: [{
                name: 'loginname',
                label: 'Username'
            }, {
                name: 'first_name',
                label: 'First name'
            }, {
                name: 'last_name',
                label: 'Last name'
            }],
            itemClick: function(item) {
                $QJHelperFunctions.changeState('module-user-edit', {
                    id: item._id
                });
            }
        }, $scope);
    }


    //Load controls when current user its avaliable.
    var controlsLoaded = false;
    $rootScope.$on('currentUser.change', function() {
        loadControls();
        controlsLoaded = true;
    });
    if (!controlsLoaded && !_.isUndefined($rootScope.currentUser)) {
        loadControls();
        controlsLoaded = true;
    }


    //defaults
    $timeout(function() {
        $scope.usersFilter.filter();
    }, 2000);
})



module.controller('UserEditController', function(
    $QJCCombobox, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {
    $QJLogger.log("UserEditController -> initialized");


    $scope.breadcrumb = {
        name: 'User',
        list: [{
            name: "Users",
            state: 'module-user-list',
            //fa: 'fa-dashboard'
        }, ],
        active: 'Loading...'
    };


    var _user_id = $state.params.id;

    $scope.crud = {
        errors: []
    }

    function showError(error) {
        $scope.crud.errors.push(error);
        return true;
    }

    function formHasErrors() {
        $scope.crud.errors = [];
        var hasErrors = false;
        if (_.isUndefined($scope.item.loginname) || $scope.item.loginname == '') {
            hasErrors = showError('Username required');
        }
        if (_.isUndefined($scope.item.first_name) || $scope.item.first_name == '') {
            hasErrors = showError('First name required');
        }
        if (_.isUndefined($scope.item.last_name) || $scope.item.last_name == '') {
            hasErrors = showError('Last name required');
        }
        if (_.isUndefined($scope.item._usergroup_id) || $scope.item._usergroup_id == '') {
            hasErrors = showError('Usergroup required');
        }
        return hasErrors;
    }

    $scope.save = function() {
        if (!formHasErrors()) {
            //console.info('Salvando!');
            $QJApi.getController('user').post({
                action: 'save'
            }, $scope.item, function(res) {
                $QJLogger.log("UserEditController -> user -> api post -> user save -> success");
                //
                showError('Cambios guardados');
            });
        };
    };
    $scope.cancel = function() {
        $QJHelperFunctions.changeState('module-user-list');
    };
    $scope.delete = function() {
        var r = confirm("Delete " + $scope.item.loginname + " ?");
        if (r == true) {
            $QJApi.getController('user').post({
                action: 'delete'
            }, $scope.item, function(res) {
                $QJLogger.log("UserEditController -> user -> api post -> user delete -> success");
                //
                showError('Cambios guardados');
                showError($scope.item.loginname + ' eliminado');
                create();
            });
        } else {}
    }


    function create() {
        $scope.item = {
            loginname: '',
            first_name: '',
            last_name: '',
            password: '',
            _usergroup_id: $scope.item._usergroup_id || '',
            _id: -1
        };
    }

    function loadControls() {

        //combobox only items who user has access
        $QJCCombobox.create({
            name: 'userEditUsergroupAccessCBO',
            label: "Usergroup",
            code: $scope.item._usergroup_id,
            disabled:true,
            code_copyto: 'item._usergroup_id',
            api: {
                controller: 'usergroup',
                params: {
                    action: 'combobox_access'
                }
            },
        }, $scope);


        //combobox
        $QJCCombobox.create({
            name: 'userEditUsergroupCBO',
            label: "Usergroup",
            code: $scope.item._usergroup_id,
            code_copyto: 'item._usergroup_id',
            api: {
                controller: 'usergroup',
                params: {
                    action: 'combobox'
                }
            },
        }, $scope);
    }

    if (_user_id == -1) {
        //CREATE
        create();
        loadControls();
    } else {
        //UPDATE
        $QJApi.getController('user').get({
            action: 'single',
            id: _user_id
        }, function(res) {
            $QJLogger.log("UserEditController -> user -> api get -> user single -> success");
            $scope.item = res.user;
            $scope.breadcrumb.active = $scope.item.loginname;
            loadControls();
        });

    }



});


;
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controllers\\mod.usersCtrl.js","/..\\controllers")
},{"./_module_init.js":7,"buffer":1,"htZkx4":4}],18:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.controller('NavController', function(
	$QJLogger, $QJHelperFunctions, $QJApi,
	$scope, $rootScope, $QJLoginModule, $QJLocalSession, $QJConfig) {
	$QJLogger.log("NavController -> initialized");

	//Siempre que entra al home recupera los datos del usuario actual y los setea globalmente en el rootScope.
	$QJApi.getController('user').get({
		action: 'current'
	}, function(res) {
		$QJLogger.log("HomeController -> user -> api get -> user single -> success");
		$rootScope.currentUser = res.user;
		$rootScope.session.user = res.user;
		$rootScope.$emit('currentUser.change');
		//console.info(res);



	});

	$scope.signout = function() {
		$rootScope.session.token = null;
		store.clear();
		$QJHelperFunctions.changeState('login');
		$QJLogger.log("NavController -> signout -> at " + new Date());
	}
});
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controllers\\navCtrl.js","/..\\controllers")
},{"./_module_init.js":7,"buffer":1,"htZkx4":4}],19:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.controller('QJBackendSettingsController', function(
	$QJAuth, $QJCCombobox, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {
	$QJLogger.log("QJBackendSettingsController -> initialized");


	$scope.breadcrumb = {
		name: 'Settings',
		list: [
			//{name:'None2',state:'',fa:'fa-dashboard'}
		],
		active: "Settings"
	};

	function loadControls() {
		//combobox
		$QJCCombobox.create({
			name: 'configGroupCBO',
			label: "Grupo de implementacion",
			code: $scope.stats._group_id,
			//code_copyto: 'usersFilter.fields._usergroup_id',
			api: {
				controller: 'group',
				params: {
					action: 'combobox_assoc'
				}
			},
		}, $scope);
	}

	function onTokenUpdate(callback) {
		$QJApi.getController('user').get({
			action: 'current'
		}, function(res) {
			$QJLogger.log("HomeController -> user -> current  -> success");
			$scope.stats = res.user;
			//console.info(res);
			callback();
		});
	}
	$rootScope.$on('session.change', function() {
		onTokenUpdate(function() {});
	});
	onTokenUpdate(function() {
		loadControls();
	});


	$scope.$on('configGroupCBO.change', function(args1, args2) {
		if (args2.selectedValue !== -1 && args2.selectedValue !== $scope.stats._group_id) {
			console.info('changing impl');
			$QJApi.getController('auth').post({
				action: 'changegroup'
			}, {
				_group_id: args2.selectedValue
			}, function(res) {
				$QJLogger.log("HomeController -> auth -> changegroup  -> success");
				$QJAuth.updateSessionCustom(res.token, args2.selectedValue);
			});

		}
	});

});
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controllers\\settingsCtrl.js","/..\\controllers")
},{"./_module_init.js":7,"buffer":1,"htZkx4":4}],20:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.controller('SidebarController', function(
    $QJLogger, $scope, $rootScope, $QJLoginModule, $QJLocalSession, $QJConfig, $QJApi) {
    $QJLogger.log("SidebarController -> initialized");

    function getNodesForCurrentToken() {
        //Siempre que carga el sidebar recupera el menu para el usuario
        $QJApi.getController('module').get({
            action: 'menu'
        }, function(res) {
            $QJLogger.log("SidebarController -> api get -> module menu -> success");
            //console.info(res);
            $scope.modules = res.modules;
        });
    }

    $rootScope.$on('session.change', function(args1, args2) {
        getNodesForCurrentToken();
    });

    getNodesForCurrentToken();
});
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controllers\\sidebarCtrl.js","/..\\controllers")
},{"./_module_init.js":7,"buffer":1,"htZkx4":4}],21:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.controller('VipsterConfigController', function(
    $QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger
    , $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {
    $QJLogger.log("VipsterConfigController -> initialized");


});

}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controllers\\vp.configCtrl.js","/..\\controllers")
},{"./_module_init.js":7,"buffer":1,"htZkx4":4}],22:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
module.exports = angular.module('app.controls', []);
require('./qjcomboboxCtrl.js');
require('./qjfilterCtrl.js');
require('./qjlistviewCtrl.js');
require('./qjselectkeyCtrl.js');
require('./qjtimercounterCtrl.js');
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controls\\_module_init.js","/..\\controls")
},{"./qjcomboboxCtrl.js":23,"./qjfilterCtrl.js":24,"./qjlistviewCtrl.js":25,"./qjselectkeyCtrl.js":26,"./qjtimercounterCtrl.js":27,"buffer":1,"htZkx4":4}],23:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.factory('$QJCCombobox', [
	'$QJApi', '$QJHelperFunctions', '$QJLogger', '$rootScope', '$state', '$timeout', '$QJLocalSession', '$QJAuth',
	function($QJApi, $QJHelperFunctions, $QJLogger, $rootScope, $state, $timeout, $QJLocalSession, $QJAuth) {
		function seekObject(fullname, $scope, obj, index) {
			if (index == 0) {
				$QJLogger.log('QJCSelectkey -> seekObject -> something went wrong and i abort the recursive func bro!');
			}
			if (!_.isUndefined(obj) && _.isNull(obj)) {
				return obj;
			}
			if (fullname.toString().split('.').length == 1 || index == 0) {
				if (!_.isUndefined(obj)) {
					return obj[fullname] || null;
				} else {
					return $scope[fullname] || null;
				}

			} else {
				var firstPart = fullname.toString().split('.')[0];
				var rest = fullname.substring(firstPart.length + 1);
				//console.log("obj ->"+obj);
				//console.log("firstpart->"+firstPart);
				//console.log("rest->"+rest);
				return seekObject(rest, $scope, obj != null ? obj[firstPart] : $scope[firstPart], (_.isUndefined(index) ? 20 : index--));
			}
		};
		return {
			create: function(settings, $scope) {

				/*
				console.info('QJCCombobox ->  LOAD '
					+ ' CODE['+settings.code+']'
				);
*/

				settings.code_copyto = settings.code_copyto || null;
				settings.description_copyto = settings.description_copyto || null;


				var self = settings;

				self.initialValue = settings.code;
				self.selectedValue = self.selectedValue || -1;
				self.disabled = self.disabled || false;

				self.ngSelected = function(item) {
					return item._id == self.initialValue;
				};

				$scope[settings.name] = self; //sets to the scope !!!!

				if (typeof cbo == "undefined") {
					cbo = [];
				}
				cbo.push(self);

				$scope.$watch(settings.name + ".selectedValue", function(newVal, oldVal) {
					self.code = newVal;
					$scope.$emit(settings.name + '.change', {
						selectedValue: newVal
					});
				});
				$scope.$watch(settings.name + ".code", function(newVal, oldVal) {
					self.selectedValue = newVal;

					self.description = (_.find(self.items, function(item) {
						return item._id == newVal;
					}));
					self.description = self.description && self.description.description || "";

					$scope.$emit(settings.name + '.change', {
						selectedValue: newVal
					});
				});

				function copy(obj, fieldWord, val) {
					if (_.isUndefined(val)) {
						return;
					}
					if (val.toString() === '-1') {
						obj[fieldWord] = '';
					} else {
						obj[fieldWord] = val;
					}
				}

				function copyWhenPosible(fullpath, val) {
					if (_.isUndefined(fullpath) || _.isNull(fullpath) || fullpath.length == 0) {
						return; //omit!
					}
					var cuts = fullpath.toString().split('.');
					var fieldWord = cuts[cuts.length - 1];
					var pos = fullpath.toString().indexOf('.' + fieldWord);
					var path = fullpath.toString().substring(0, pos);
					//console.info("seeking for path obj on _>>>> "+path);
					var obj = seekObject(path, $scope);
					//console.info("founded "+JSON.stringify(obj));
					if (_.isUndefined(obj) || _.isNull(obj)) {
						console.info("copyWhenPosible failure for path -> " + fullpath);
						return; //omit!
					}
					copy(obj, fieldWord, val);
				}


				$scope.$watch(settings.name + '.code', function(newVal, oldVal) {
					copyWhenPosible(self.code_copyto, newVal);
				});
				copyWhenPosible(self.code_copyto, self.code || '');



				//set defaults
				$scope.$emit(settings.name + '.change', {
					selectedValue: self.code
				});

				if (self.description_copyto != null) {
					var cuts = self.description_copyto.toString().split('.');
					self.description_copyto_fieldWord = cuts[cuts.length - 1];
					var pos = self.description_copyto.toString().indexOf('.' + self.description_copyto_fieldWord);
					var path = self.description_copyto.toString().substring(0, pos);
					self.description_copyto_obj = seekObject(path, $scope);
					$scope.$watch(settings.name + '.description', function(newVal, oldVal) {
						copy(self.description_copyto_obj, self.description_copyto_fieldWord, newVal);
					});
					copy(self.description_copyto_obj, self.description_copyto_fieldWord, self.description || '');
					$scope.$emit(settings.name + '.description', {
						description: self.description
					});
				}


				self.update = function() {
					$QJApi.getController(settings.api.controller).get(settings.api.params, function(res) {
						//$QJLogger.log("QJCCombobox -> "+settings.name+" -> " + settings.api.controller + "  " + settings.api.params.action + " ("+JSON.stringify(settings.api.params)+") -> success");
						self.items = res.items;
						self.selectedValue = self.initialValue;
						//console.info(res.req);
					});
				};
				self.update(); //initial

				//watch for params change to update
				$scope.$watch(settings.name + '.api.params', function(newVal, oldVal) {
					self.update();
					//$QJLogger.log("QJCCombobox -> " + settings.name + " -> params changes -> updating..");
				}, true);


			}
		};
	}
]);
module.directive('qjccombobox', function($rootScope) {
	var directive = {};
	directive.restrict = 'E'; /* restrict this directive to elements */
	directive.templateUrl = "pages/controls/qjccombobox.html";
	directive.scope = {
		cbo: '='
	};
	directive.compile = function(element, attributes) {
		var linkFunction = function($scope, element, attributes) {}
		return linkFunction;
	}
	return directive;
});
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controls\\qjcomboboxCtrl.js","/..\\controls")
},{"./_module_init.js":22,"buffer":1,"htZkx4":4}],24:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.factory('$QJCFilter', [
	'$QJLogger', '$rootScope', '$state', '$timeout', '$QJLocalSession', '$QJAuth',
	function($QJLogger, $rootScope, $state, $timeout, $QJLocalSession, $QJAuth) {
		var self = {
			fields: {}
		};

		function getBindedArray(arrayName, $scope, obj, index) {
			if (index == 0) {
				$QJLogger.log('QJCFilter -> getBindedArray -> something went wrong and i abort the recursive func bro!');
			}
			if (!_.isUndefined(obj) && _.isNull(obj)) {
				return obj;
			}
			if (arrayName.toString().split('.').length == 1 || index == 0) {
				//console.info(arrayName);
				if (!_.isUndefined(obj)) {
					return obj[arrayName] || null;
				} else {
					//console.info('return this ->'+arrayName);
					//console.info($scope[arrayName]);
					return $scope[arrayName] || null;
				}

			} else {
				var firstPart = arrayName.toString().split('.')[0];
				var rest = arrayName.substring(firstPart.length + 1);
				//console.info(arrayName);
				return getBindedArray(rest, $scope, $scope[firstPart], (_.isUndefined(index) ? 20 : index--));
			}

		};
		return {
			create: function(settings, $scope) {
				_.each(settings.fields, function(field, key) {
					self.fields[field.name] = null;
				});

				//defaults
				settings.filteredfieldName = settings.filteredfieldName || '_qjfiltered';

				//stores settings as property
				self.settings = settings;
				$scope[settings.name] = self;

				self.filter = function() {
					//console.clear();
					containValidationSuccessItemsKeys = [];
					_.each(self.fields, function(val, key) {
						var keyWhoChanges = key; //updates based on all filters ! fix
						var newFieldValue = val;
						_.each(settings.fields, function(field, key) {
							if (keyWhoChanges !== field.name) return; //take only the one who changes
							var bindedArray = getBindedArray(field.arrayName, $scope);
							if (bindedArray !== null) {
								_.each(bindedArray, function(bindedArrayItem, bindedArrayItemKey) {
									bindedArrayItemHasSuccessAny = (null != _.find(containValidationSuccessItemsKeys, function(val) {
										return val == bindedArrayItemKey
									}));
									if (bindedArrayItemHasSuccessAny) {
										return; // jump because alredy succes validation and it not gonna be filtered
									}
									var containValidationResponse = [];
									_.each(field.bindTo, function(bindToField, key) {
										var _field = bindedArrayItem[bindToField];
										if (!_.isUndefined(_field)) {
											if (_field !== null) {
												var flag = true;
												if (_.isUndefined(newFieldValue) || _.isNull(newFieldValue) || newFieldValue == "") {
													return; // jump because filter field is empty!
												} else {
													var indexof = _field.toString().toLowerCase().indexOf(newFieldValue.toString().toLowerCase());
													if (indexof !== -1) {
														flag = true;
													} else {
														flag = false;
													}
												}
												containValidationResponse.push(flag);

											} else {
												$QJLogger.log("QJCFilter -> Warning -> bindedArrayItem " + bindToField + " at index " + bindedArrayItemKey + " is null so its omited from filtering");
											}
										} else {
											$QJLogger.log("QJCFilter -> Warning -> bindedArrayItem " + bindToField + " do not exists in " + field.arrayName);
										}
									});
									var passContainValidation = (null != _.find(containValidationResponse, function(val) {
										return val == true
									}));
									bindedArrayItem[settings.filteredfieldName] = !passContainValidation;
									if (containValidationResponse.length == 0) {
										bindedArrayItem[settings.filteredfieldName] = false; //no hubo respuestas por lo tanto no se filtra
									}
									if (bindedArrayItem[settings.filteredfieldName]) {
										containValidationSuccessItemsKeys.push(bindedArrayItemKey); //si se filtra una ves jump para el resto
									}
								});
							} else {
								$QJLogger.log("QJCFilter -> Warning -> arrayName " + field.arrayName + " for filter field " + field.name + " do not exists on the scope");
							}
						});
					});
					$scope.$emit('qjcfilter.update', {
						filteredfieldName: settings.filteredfieldName
					});
				};
				$scope.$watch(settings.name + '.fields', function(newValue, oldValue) {
					self.filter();
				}, true);
			}
		}
	}
]);
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controls\\qjfilterCtrl.js","/..\\controls")
},{"./_module_init.js":22,"buffer":1,"htZkx4":4}],25:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.factory('$QJCListview', [
	'$QJApi', '$QJHelperFunctions', '$QJLogger', '$rootScope', '$state', '$timeout', '$QJLocalSession', '$QJAuth',
	function($QJApi, $QJHelperFunctions, $QJLogger, $rootScope, $state, $timeout, $QJLocalSession, $QJAuth) {


		function createPagedList(items, entriesPerPage) {
			var pagesCounter = 1;
			var pages = [];
			//
			var _currItemIndex = 0;
			var _currPage = [];
			while (_currItemIndex < items.length) { //ej: 0 < 5
				if (_currPage.length < entriesPerPage) {
					_currPage.push(items[_currItemIndex]);
					_currItemIndex++;
				} else {
					pages.push(_currPage);
					_currPage = [];
					pagesCounter++;
				}
			}
			if (_currPage.length > 0) {
				pages.push(_currPage);
			}
			return pages;
		}

		function buildListViewData(items) {
			var entriesPerPage = $rootScope.config.listviewEntriesPerPage; //ej: 2   
			var pages = [];
			if (!_.isUndefined(items)) {
				pages = createPagedList(items, entriesPerPage);
			}
			var pageNumbers = [];
			_.each(pages, function(e, index) {
				pageNumbers.push(index + 1);
			});
			var _lvData = {
				currentPageIndex: 0,
				currentPage: pages[0],
				totalPages: pages.length,
				totalItems: items.length,
				pages: pages,
				pagination: {
					pageNumbers: pageNumbers,
					disabledForPrevLink: function() {
						return _lvData.currentPageIndex === 0 ? true : false;
					},
					disabledForNextLink: function() {
						return _lvData.currentPageIndex >= pages.length - 1 ? true : false;
					},
					activeForLink: function(pageNumber) {
						if ((pageNumber === _lvData.currentPageIndex + 1)) {
							return true;
						} else {
							return false;
						}
					},
					goto: function(pageNumber) {
						_lvData.currentPageIndex = pageNumber - 1;
						_lvData.currentPage = pages[_lvData.currentPageIndex];
					},
					next: function() {
						_lvData.currentPageIndex++;
						if (_lvData.currentPageIndex >= pages.length) {
							_lvData.currentPageIndex = pages.length - 1;
						}
						_lvData.currentPage = pages[_lvData.currentPageIndex];
					},
					prev: function() {
						_lvData.currentPageIndex--;
						if (_lvData.currentPageIndex <= 0) {
							_lvData.currentPageIndex = 0;
						}
						_lvData.currentPage = pages[_lvData.currentPageIndex];
					}
				}
			};
			return _lvData;
		}
		return {
			create: function(settings, $scope) {
				//instance private
				function render(items) {
					$scope[settings.pagedDataArray] = buildListViewData(items);
				}



				//watch
				$scope.$watch(settings.dataArray, function(newValue, oldValue) {

					if (_.isUndefined($scope[settings.dataArray])) {
						$QJLogger.log("WARNING: QJCListview -> " + settings.dataArray + " -> " + " dataArray undefined");
						return;
					}

					$scope[settings.pagedDataArray] = buildListViewData($scope[settings.dataArray]);
					render($scope[settings.dataArray]);
				});


				$scope.$on('qjcfilter.update', function(args1, args2) {
					$scope.$emit(settings.name + ".update", {});
					var filteredData = _.filter($scope[settings.dataArray], function(item) {
						return !item[args2.filteredfieldName];
					});
					render(filteredData);

					var filteredCount = _.filter($scope[settings.dataArray], function(item) {
						return item[args2.filteredfieldName] == true;
					});
					$scope.$emit('qjclistview.filter.success', {
						filteredCount: filteredCount
					});

				});

				var self = settings;
				$scope[settings.name] = self;

				self.update = function() {
					//DB
					$QJApi.getController(settings.api.controller).get(settings.api.params, function(res) {
						$QJLogger.log("QJCListview -> " + settings.api.controller + " " + settings.api.params.action + " -> success");
						$scope[settings.dataArray] = res.items;
						$scope.$emit(settings.name + ".update", {});
						//console.info($scope[settings.dataArray]);
					});
					//$scope.$emit(settings.name+".update",{});
				};
				self.update();


			}
		};
	}
]);


module.directive('qjclistview', function() {
	var directive = {};
	directive.restrict = 'E'; /* restrict this directive to elements */
	directive.templateUrl = "pages/controls/qjclistview.html";
	directive.scope = {
		data: "=",
		lvw: "="
	}
	directive.compile = function(element, attributes) {
		var linkFunction = function($scope, element, attributes) {}
		return linkFunction;
	}
	return directive;
});
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controls\\qjlistviewCtrl.js","/..\\controls")
},{"./_module_init.js":22,"buffer":1,"htZkx4":4}],26:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.factory('$QJCSelectkey', [
	'$QJLogger', '$rootScope', '$state', '$timeout', '$QJLocalSession', '$QJAuth',
	function($QJLogger, $rootScope, $state, $timeout, $QJLocalSession, $QJAuth) {
		return {};
	}
]);
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controls\\qjselectkeyCtrl.js","/..\\controls")
},{"./_module_init.js":22,"buffer":1,"htZkx4":4}],27:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.factory('$QJCTimeCounter', [
	'$interval', '$QJApi', '$QJHelperFunctions', '$QJLogger', '$rootScope', '$state', '$timeout', '$QJLocalSession', '$QJAuth',
	function($interval, $QJApi, $QJHelperFunctions, $QJLogger, $rootScope, $state, $timeout, $QJLocalSession, $QJAuth) {
		return {
			create: function(settings, $scope) {
				var self = _.extend(settings, {
					working: false,
					project: "none",
					startTimeFormated: null,
					endTimeFormated: null,
					errors: [],
					callingApi: false
				});
				self.addError = function(error) {
					self.errors.push(error);
					$timeout(function() {
						$scope.$apply(function() {
							self.errors = [];
						});
					}, 2000);
				};
				self.restart = function() {
					self.startTimeFormated = null;
					self.endTimeFormated = null;
					self.errors = [];
					self.diffFormated = null;
				};
				self.init = function() {
					if (self.callingApi) return; //calling apy sync please.
					self.restart();
					self.callingApi = true;
					$QJApi.getController(settings.api.controller).get(settings.api.params, function(res) {
						self.callingApi = false;
						$QJLogger.log("QJCTimeCounter -> " + JSON.stringify(settings.api) + " -> success");
						self.working = (res.item != null);
						self.resitem = res.item;
						if (!_.isUndefined(settings.onInit)) {
							settings.onInit(self);
						}
					});
					return self;
				};
				self.getTime = function() {
					return new Date().getTime();
				};
				self.getTimeFormated = function() {
					return moment(self.getTime()).format("dddd, MMMM Do YYYY, h:mm:ss a");
				};
				self.getDiff = function(milli) {
					var actual = self.getTime();
					return (actual - milli);
				};
				self.getDiffFormated = function(milli) {
					var diff = self.getDiff(milli);
					var duration = {
						hours: Math.round((diff / 1000 / 60 / 60) % 24),
						minutes: Math.round((diff / 1000 / 60) % 60),
						seconds: Math.round((diff / 1000) % 60)
					};
					var str = "";
					str += duration.hours + " hours, ";
					str += duration.minutes + " mins, ";
					str += duration.seconds + " secs, ";
					//str += diff + " total, ";
					return str;
				};
				self.validateStart = function() {
					if (!_.isUndefined(settings.onValidateStart)) {
						return settings.onValidateStart(self);
					} else {
						return true;
					}
				};
				self.resume = function(from) {
					self.start(from);
				};
				self.start = function(start) {
					if (!self.validateStart()) {
						return;
					} else {
						//console.info("TIMER STARTED FAIL");
					}

					//
					//console.info("TIMER STARTED");

					if (start && start.length > 0) {
						self._startVal = parseInt(start);
					} else {
						self._startVal = self.getTime(); //start setted	
					}

					if (!_.isUndefined(settings.onStartChange)) {
						settings.onStartChange(self._startVal, self);
					}
					self.startTimeFormated = self.getTimeFormated(); //start formated setted
					self.endTimeFormated = self.startTimeFormated; //end setted
					self.diff = self.getDiff(self._startVal);
					self.diffFormated = self.getDiffFormated(self._startVal);
					if (!_.isUndefined(settings.onDiffChange)) {
						settings.onDiffChange(self.diff, self.diffFormated, self);
					}
					self.workingInterval = $interval(function() {
						if (!self.working) return;
						self._stopVal = self.getTime();
						if (!_.isUndefined(settings.onStopChange)) {
							settings.onStopChange(self._stopVal, self);
						}
						self.endTimeFormated = self.getTimeFormated();
						self.diff = self.getDiff(self._startVal);
						self.diffFormated = self.getDiffFormated(self._startVal);
						if (!_.isUndefined(settings.onDiffChange)) {
							settings.onDiffChange(self.diff, self.diffFormated, self);
						}
					}, 1000);
					self.working = true;
					if (!_.isUndefined(settings.onStartClick)) {
						settings.onStartClick(self);
					}
				};
				self.stop = function() {
					self.working = false;
					$interval.cancel(self.workingInterval);
					if (!_.isUndefined(settings.onStopClick)) {
						settings.onStopClick(self);
					}
				};
				$scope[settings.name] = self;
				return self;
			}
		};
	}
]);
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\controls\\qjtimercounterCtrl.js","/..\\controls")
},{"./_module_init.js":22,"buffer":1,"htZkx4":4}],28:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
module.exports = angular.module('app.directives', []);
require('./ngenterDirective.js');
require('./qjapiinfoDirective.js');
require('./qjbreadcrumbDirective.js');
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\directives\\_module_init.js","/..\\directives")
},{"./ngenterDirective.js":29,"./qjapiinfoDirective.js":30,"./qjbreadcrumbDirective.js":31,"buffer":1,"htZkx4":4}],29:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.directive('ngEnter', function() {
	return function(scope, element, attrs) {
		element.bind("keydown keypress", function(event) {
			if (event.which === 13) {
				scope.$apply(function() {
					scope.$eval(attrs.ngEnter);
				});

				event.preventDefault();
			}
		});
	};
});
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\directives\\ngenterDirective.js","/..\\directives")
},{"./_module_init.js":28,"buffer":1,"htZkx4":4}],30:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
//
module.directive('qjapiinfo', function() {
	var directive = {};
	directive.restrict = 'E'; /* restrict this directive to elements */
	directive.templateUrl = "pages/controls/qjapiinfo.html";
	directive.compile = function(element, attributes) {
		var linkFunction = function($scope, element, attributes) {}
		return linkFunction;
	}
	return directive;
});
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\directives\\qjapiinfoDirective.js","/..\\directives")
},{"./_module_init.js":28,"buffer":1,"htZkx4":4}],31:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
//
module.directive('qjbreadcrumb', function($QJHelperFunctions) {
	var directive = {};
	directive.restrict = 'E'; /* restrict this directive to elements */
	directive.templateUrl = "pages/module_directives/module.breadcrumb.directive.html";
	directive.scope = {
		data: "="
	}
	directive.compile = function(element, attributes) {
		var linkFunction = function($scope, element, attributes) {

			$scope.data.goto = function(item) {
				$QJHelperFunctions.changeState(item.state, item.params);
			};

		}
		return linkFunction;
	}
	return directive;
});
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\directives\\qjbreadcrumbDirective.js","/..\\directives")
},{"./_module_init.js":28,"buffer":1,"htZkx4":4}],32:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/*!
 * Author: Abdullah A Almsaeed
 * Date: 4 Jan 2014
 * Description:
 *      This file should be included in all pages
 !**/

/*
 * Global variables. If you change any of these vars, don't forget 
 * to change the values in the less files!
 */
var left_side_width = 220; //Sidebar width in pixels

$(function() {
    "use strict";

    //Enable sidebar toggle
    $("[data-toggle='offcanvas']").click(function(e) {
        e.preventDefault();

        //If window is small enough, enable sidebar push menu
        if ($(window).width() <= 992) {
            $('.row-offcanvas').toggleClass('active');
            $('.left-side').removeClass("collapse-left");
            $(".right-side").removeClass("strech");
            $('.row-offcanvas').toggleClass("relative");
        } else {
            //Else, enable content streching
            $('.left-side').toggleClass("collapse-left");
            $(".right-side").toggleClass("strech");
        }
    });

    //Add hover support for touch devices
    $('.btn').bind('touchstart', function() {
        $(this).addClass('hover');
    }).bind('touchend', function() {
        $(this).removeClass('hover');
    });

    //Activate tooltips
    $("[data-toggle='tooltip']").tooltip();

    /*     
     * Add collapse and remove events to boxes
     */
    $("[data-widget='collapse']").click(function() {
        //Find the box parent        
        var box = $(this).parents(".box").first();
        //Find the body and the footer
        var bf = box.find(".box-body, .box-footer");
        if (!box.hasClass("collapsed-box")) {
            box.addClass("collapsed-box");
            bf.slideUp();
        } else {
            box.removeClass("collapsed-box");
            bf.slideDown();
        }
    });

    /*
     * ADD SLIMSCROLL TO THE TOP NAV DROPDOWNS
     * ---------------------------------------
     */
    $(".navbar .menu").slimscroll({
        height: "200px",
        alwaysVisible: false,
        size: "3px"
    }).css("width", "100%");

    /*
     * INITIALIZE BUTTON TOGGLE
     * ------------------------
     */
    $('.btn-group[data-toggle="btn-toggle"]').each(function() {
        var group = $(this);
        $(this).find(".btn").click(function(e) {
            group.find(".btn.active").removeClass("active");
            $(this).addClass("active");
            e.preventDefault();
        });

    });

    $("[data-widget='remove']").click(function() {
        //Find the box parent        
        var box = $(this).parents(".box").first();
        box.slideUp();
    });

    /* Sidebar tree view */
    $(".sidebar .treeview").tree();

    /* 
     * Make sure that the sidebar is streched full height
     * ---------------------------------------------
     * We are gonna assign a min-height value every time the
     * wrapper gets resized and upon page load. We will use
     * Ben Alman's method for detecting the resize event.
     * 
     **/
    function _fix() {
        //Get window height and the wrapper height
        var height = $(window).height() - $("body > .header").height();
        $(".wrapper").css("min-height", height + "px");
        var content = $(".right-side").height();
        //If the wrapper height is greater than the window
        if (content > height)
            //then set sidebar height to the wrapper
            $(".left-side, html, body").css("min-height", content + "px");
        else {
            //Otherwise, set the sidebar to the height of the window
            $(".left-side, html, body").css("min-height", height + "px");
        }
    }
    //Fire upon load
    _fix();
    //Fire when wrapper is resized
    $(".wrapper").resize(function() {
        _fix();
        fix_sidebar();
    });

    //Fix the fixed layout sidebar scroll bug
    fix_sidebar();

    /*
     * We are gonna initialize all checkbox and radio inputs to 
     * iCheck plugin in.
     * You can find the documentation at http://fronteed.com/iCheck/
     */
    $("input[type='checkbox'], input[type='radio']").iCheck({
        checkboxClass: 'icheckbox_minimal',
        radioClass: 'iradio_minimal'
    });

});
function fix_sidebar() {
    //Make sure the body tag has the .fixed class
    if (!$("body").hasClass("fixed")) {
        return;
    }

    //Add slimscroll
    $(".sidebar").slimscroll({
        height: ($(window).height() - $(".header").height()) + "px",
        color: "rgba(0,0,0,0.2)"
    });
}
function change_layout() {
    $("body").toggleClass("fixed");
    fix_sidebar();
}
function change_skin(cls) {
    $("body").removeClass("skin-blue skin-black");
    $("body").addClass(cls);
}
/*END DEMO*/
$(window).load(function() {
    /*! pace 0.4.17 */
    (function() {
        var a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V = [].slice, W = {}.hasOwnProperty, X = function(a, b) {
            function c() {
                this.constructor = a
            }
            for (var d in b)
                W.call(b, d) && (a[d] = b[d]);
            return c.prototype = b.prototype, a.prototype = new c, a.__super__ = b.prototype, a
        }, Y = [].indexOf || function(a) {
            for (var b = 0, c = this.length; c > b; b++)
                if (b in this && this[b] === a)
                    return b;
            return-1
        };
        for (t = {catchupTime:500, initialRate:.03, minTime:500, ghostTime:500, maxProgressPerFrame:10, easeFactor:1.25, startOnPageLoad:!0, restartOnPushState:!0, restartOnRequestAfter:500, target:"body", elements:{checkInterval:100, selectors:["body"]}, eventLag:{minSamples:10, sampleCount:3, lagThreshold:3}, ajax:{trackMethods:["GET"], trackWebSockets:!1}}, B = function() {
            var a;
            return null != (a = "undefined" != typeof performance && null !== performance ? "function" == typeof performance.now ? performance.now() : void 0 : void 0) ? a : +new Date
        }, D = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame, s = window.cancelAnimationFrame || window.mozCancelAnimationFrame, null == D && (D = function(a) {
            return setTimeout(a, 50)
        }, s = function(a) {
            return clearTimeout(a)
        }), F = function(a) {
            var b, c;
            return b = B(), (c = function() {
                var d;
                return d = B() - b, d >= 33 ? (b = B(), a(d, function() {
                    return D(c)
                })) : setTimeout(c, 33 - d)
            })()
        }, E = function() {
            var a, b, c;
            return c = arguments[0], b = arguments[1], a = 3 <= arguments.length ? V.call(arguments, 2) : [], "function" == typeof c[b] ? c[b].apply(c, a) : c[b]
        }, u = function() {
            var a, b, c, d, e, f, g;
            for (b = arguments[0], d = 2 <= arguments.length?V.call(arguments, 1):[], f = 0, g = d.length; g > f; f++)
                if (c = d[f])
                    for (a in c)
                        W.call(c, a) && (e = c[a], null != b[a] && "object" == typeof b[a] && null != e && "object" == typeof e ? u(b[a], e) : b[a] = e);
            return b
        }, p = function(a) {
            var b, c, d, e, f;
            for (c = b = 0, e = 0, f = a.length; f > e; e++)
                d = a[e], c += Math.abs(d), b++;
            return c / b
        }, w = function(a, b) {
            var c, d, e;
            if (null == a && (a = "options"), null == b && (b = !0), e = document.querySelector("[data-pace-" + a + "]")) {
                if (c = e.getAttribute("data-pace-" + a), !b)
                    return c;
                try {
                    return JSON.parse(c)
                } catch (f) {
                    return d = f, "undefined" != typeof console && null !== console ? console.error("Error parsing inline pace options", d) : void 0
                }
            }
        }, g = function() {
            function a() {
            }
            return a.prototype.on = function(a, b, c, d) {
                var e;
                return null == d && (d = !1), null == this.bindings && (this.bindings = {}), null == (e = this.bindings)[a] && (e[a] = []), this.bindings[a].push({handler: b, ctx: c, once: d})
            }, a.prototype.once = function(a, b, c) {
                return this.on(a, b, c, !0)
            }, a.prototype.off = function(a, b) {
                var c, d, e;
                if (null != (null != (d = this.bindings) ? d[a] : void 0)) {
                    if (null == b)
                        return delete this.bindings[a];
                    for (c = 0, e = []; c < this.bindings[a].length; )
                        this.bindings[a][c].handler === b ? e.push(this.bindings[a].splice(c, 1)) : e.push(c++);
                    return e
                }
            }, a.prototype.trigger = function() {
                var a, b, c, d, e, f, g, h, i;
                if (c = arguments[0], a = 2 <= arguments.length ? V.call(arguments, 1) : [], null != (g = this.bindings) ? g[c] : void 0) {
                    for (e = 0, i = []; e < this.bindings[c].length; )
                        h = this.bindings[c][e], d = h.handler, b = h.ctx, f = h.once, d.apply(null != b ? b : this, a), f ? i.push(this.bindings[c].splice(e, 1)) : i.push(e++);
                    return i
                }
            }, a
        }(), null == window.Pace && (window.Pace = {}), u(Pace, g.prototype), C = Pace.options = u({}, t, window.paceOptions, w()), S = ["ajax", "document", "eventLag", "elements"], O = 0, Q = S.length; Q > O; O++)
            I = S[O], C[I] === !0 && (C[I] = t[I]);
        i = function(a) {
            function b() {
                return T = b.__super__.constructor.apply(this, arguments)
            }
            return X(b, a), b
        }(Error), b = function() {
            function a() {
                this.progress = 0
            }
            return a.prototype.getElement = function() {
                var a;
                if (null == this.el) {
                    if (a = document.querySelector(C.target), !a)
                        throw new i;
                    this.el = document.createElement("div"), this.el.className = "pace pace-active", document.body.className = document.body.className.replace("pace-done", ""), document.body.className += " pace-running", this.el.innerHTML = '<div class="pace-progress">\n  <div class="pace-progress-inner"></div>\n</div>\n<div class="pace-activity"></div>', null != a.firstChild ? a.insertBefore(this.el, a.firstChild) : a.appendChild(this.el)
                }
                return this.el
            }, a.prototype.finish = function() {
                var a;
                return a = this.getElement(), a.className = a.className.replace("pace-active", ""), a.className += " pace-inactive", document.body.className = document.body.className.replace("pace-running", ""), document.body.className += " pace-done"
            }, a.prototype.update = function(a) {
                return this.progress = a, this.render()
            }, a.prototype.destroy = function() {
                try {
                    this.getElement().parentNode.removeChild(this.getElement())
                } catch (a) {
                    i = a
                }
                return this.el = void 0
            }, a.prototype.render = function() {
                var a, b;
                return null == document.querySelector(C.target) ? !1 : (a = this.getElement(), a.children[0].style.width = "" + this.progress + "%", (!this.lastRenderedProgress || this.lastRenderedProgress | 0 !== this.progress | 0) && (a.children[0].setAttribute("data-progress-text", "" + (0 | this.progress) + "%"), this.progress >= 100 ? b = "99" : (b = this.progress < 10 ? "0" : "", b += 0 | this.progress), a.children[0].setAttribute("data-progress", "" + b)), this.lastRenderedProgress = this.progress)
            }, a.prototype.done = function() {
                return this.progress >= 100
            }, a
        }(), h = function() {
            function a() {
                this.bindings = {}
            }
            return a.prototype.trigger = function(a, b) {
                var c, d, e, f, g;
                if (null != this.bindings[a]) {
                    for (f = this.bindings[a], g = [], d = 0, e = f.length; e > d; d++)
                        c = f[d], g.push(c.call(this, b));
                    return g
                }
            }, a.prototype.on = function(a, b) {
                var c;
                return null == (c = this.bindings)[a] && (c[a] = []), this.bindings[a].push(b)
            }, a
        }(), N = window.XMLHttpRequest, M = window.XDomainRequest, L = window.WebSocket, v = function(a, b) {
            var c, d, e, f;
            f = [];
            for (d in b.prototype)
                try {
                    e = b.prototype[d], null == a[d] && "function" != typeof e ? f.push(a[d] = e) : f.push(void 0)
                } catch (g) {
                    c = g
                }
            return f
        }, z = [], Pace.ignore = function() {
            var a, b, c;
            return b = arguments[0], a = 2 <= arguments.length ? V.call(arguments, 1) : [], z.unshift("ignore"), c = b.apply(null, a), z.shift(), c
        }, Pace.track = function() {
            var a, b, c;
            return b = arguments[0], a = 2 <= arguments.length ? V.call(arguments, 1) : [], z.unshift("track"), c = b.apply(null, a), z.shift(), c
        }, H = function(a) {
            var b;
            if (null == a && (a = "GET"), "track" === z[0])
                return"force";
            if (!z.length && C.ajax) {
                if ("socket" === a && C.ajax.trackWebSockets)
                    return!0;
                if (b = a.toUpperCase(), Y.call(C.ajax.trackMethods, b) >= 0)
                    return!0
            }
            return!1
        }, j = function(a) {
            function b() {
                var a, c = this;
                b.__super__.constructor.apply(this, arguments), a = function(a) {
                    var b;
                    return b = a.open, a.open = function(d, e) {
                        return H(d) && c.trigger("request", {type: d, url: e, request: a}), b.apply(a, arguments)
                    }
                }, window.XMLHttpRequest = function(b) {
                    var c;
                    return c = new N(b), a(c), c
                }, v(window.XMLHttpRequest, N), null != M && (window.XDomainRequest = function() {
                    var b;
                    return b = new M, a(b), b
                }, v(window.XDomainRequest, M)), null != L && C.ajax.trackWebSockets && (window.WebSocket = function(a, b) {
                    var d;
                    return d = new L(a, b), H("socket") && c.trigger("request", {type: "socket", url: a, protocols: b, request: d}), d
                }, v(window.WebSocket, L))
            }
            return X(b, a), b
        }(h), P = null, x = function() {
            return null == P && (P = new j), P
        }, x().on("request", function(b) {
            var c, d, e, f;
            return f = b.type, e = b.request, Pace.running || C.restartOnRequestAfter === !1 && "force" !== H(f) ? void 0 : (d = arguments, c = C.restartOnRequestAfter || 0, "boolean" == typeof c && (c = 0), setTimeout(function() {
                var b, c, g, h, i, j;
                if (b = "socket" === f ? e.readyState < 2 : 0 < (h = e.readyState) && 4 > h) {
                    for (Pace.restart(), i = Pace.sources, j = [], c = 0, g = i.length; g > c; c++) {
                        if (I = i[c], I instanceof a) {
                            I.watch.apply(I, d);
                            break
                        }
                        j.push(void 0)
                    }
                    return j
                }
            }, c))
        }), a = function() {
            function a() {
                var a = this;
                this.elements = [], x().on("request", function() {
                    return a.watch.apply(a, arguments)
                })
            }
            return a.prototype.watch = function(a) {
                var b, c, d;
                return d = a.type, b = a.request, c = "socket" === d ? new m(b) : new n(b), this.elements.push(c)
            }, a
        }(), n = function() {
            function a(a) {
                var b, c, d, e, f, g, h = this;
                if (this.progress = 0, null != window.ProgressEvent)
                    for (c = null, a.addEventListener("progress", function(a) {
                        return h.progress = a.lengthComputable ? 100 * a.loaded / a.total : h.progress + (100 - h.progress) / 2
                    }), g = ["load", "abort", "timeout", "error"], d = 0, e = g.length; e > d; d++)
                        b = g[d], a.addEventListener(b, function() {
                            return h.progress = 100
                        });
                else
                    f = a.onreadystatechange, a.onreadystatechange = function() {
                        var b;
                        return 0 === (b = a.readyState) || 4 === b ? h.progress = 100 : 3 === a.readyState && (h.progress = 50), "function" == typeof f ? f.apply(null, arguments) : void 0
                    }
            }
            return a
        }(), m = function() {
            function a(a) {
                var b, c, d, e, f = this;
                for (this.progress = 0, e = ["error", "open"], c = 0, d = e.length; d > c; c++)
                    b = e[c], a.addEventListener(b, function() {
                        return f.progress = 100
                    })
            }
            return a
        }(), d = function() {
            function a(a) {
                var b, c, d, f;
                for (null == a && (a = {}), this.elements = [], null == a.selectors && (a.selectors = []), f = a.selectors, c = 0, d = f.length; d > c; c++)
                    b = f[c], this.elements.push(new e(b))
            }
            return a
        }(), e = function() {
            function a(a) {
                this.selector = a, this.progress = 0, this.check()
            }
            return a.prototype.check = function() {
                var a = this;
                return document.querySelector(this.selector) ? this.done() : setTimeout(function() {
                    return a.check()
                }, C.elements.checkInterval)
            }, a.prototype.done = function() {
                return this.progress = 100
            }, a
        }(), c = function() {
            function a() {
                var a, b, c = this;
                this.progress = null != (b = this.states[document.readyState]) ? b : 100, a = document.onreadystatechange, document.onreadystatechange = function() {
                    return null != c.states[document.readyState] && (c.progress = c.states[document.readyState]), "function" == typeof a ? a.apply(null, arguments) : void 0
                }
            }
            return a.prototype.states = {loading: 0, interactive: 50, complete: 100}, a
        }(), f = function() {
            function a() {
                var a, b, c, d, e, f = this;
                this.progress = 0, a = 0, e = [], d = 0, c = B(), b = setInterval(function() {
                    var g;
                    return g = B() - c - 50, c = B(), e.push(g), e.length > C.eventLag.sampleCount && e.shift(), a = p(e), ++d >= C.eventLag.minSamples && a < C.eventLag.lagThreshold ? (f.progress = 100, clearInterval(b)) : f.progress = 100 * (3 / (a + 3))
                }, 50)
            }
            return a
        }(), l = function() {
            function a(a) {
                this.source = a, this.last = this.sinceLastUpdate = 0, this.rate = C.initialRate, this.catchup = 0, this.progress = this.lastProgress = 0, null != this.source && (this.progress = E(this.source, "progress"))
            }
            return a.prototype.tick = function(a, b) {
                var c;
                return null == b && (b = E(this.source, "progress")), b >= 100 && (this.done = !0), b === this.last ? this.sinceLastUpdate += a : (this.sinceLastUpdate && (this.rate = (b - this.last) / this.sinceLastUpdate), this.catchup = (b - this.progress) / C.catchupTime, this.sinceLastUpdate = 0, this.last = b), b > this.progress && (this.progress += this.catchup * a), c = 1 - Math.pow(this.progress / 100, C.easeFactor), this.progress += c * this.rate * a, this.progress = Math.min(this.lastProgress + C.maxProgressPerFrame, this.progress), this.progress = Math.max(0, this.progress), this.progress = Math.min(100, this.progress), this.lastProgress = this.progress, this.progress
            }, a
        }(), J = null, G = null, q = null, K = null, o = null, r = null, Pace.running = !1, y = function() {
            return C.restartOnPushState ? Pace.restart() : void 0
        }, null != window.history.pushState && (R = window.history.pushState, window.history.pushState = function() {
            return y(), R.apply(window.history, arguments)
        }), null != window.history.replaceState && (U = window.history.replaceState, window.history.replaceState = function() {
            return y(), U.apply(window.history, arguments)
        }), k = {ajax: a, elements: d, document: c, eventLag: f}, (A = function() {
            var a, c, d, e, f, g, h, i;
            for (Pace.sources = J = [], g = ["ajax", "elements", "document", "eventLag"], c = 0, e = g.length; e > c; c++)
                a = g[c], C[a] !== !1 && J.push(new k[a](C[a]));
            for (i = null != (h = C.extraSources)?h:[], d = 0, f = i.length; f > d; d++)
                I = i[d], J.push(new I(C));
            return Pace.bar = q = new b, G = [], K = new l
        })(), Pace.stop = function() {
            return Pace.trigger("stop"), Pace.running = !1, q.destroy(), r = !0, null != o && ("function" == typeof s && s(o), o = null), A()
        }, Pace.restart = function() {
            return Pace.trigger("restart"), Pace.stop(), Pace.start()
        }, Pace.go = function() {
            return Pace.running = !0, q.render(), r = !1, o = F(function(a, b) {
                var c, d, e, f, g, h, i, j, k, m, n, o, p, s, t, u, v;
                for (j = 100 - q.progress, d = o = 0, e = !0, h = p = 0, t = J.length; t > p; h = ++p)
                    for (I = J[h], m = null != G[h]?G[h]:G[h] = [], g = null != (v = I.elements)?v:[I], i = s = 0, u = g.length; u > s; i = ++s)
                        f = g[i], k = null != m[i] ? m[i] : m[i] = new l(f), e &= k.done, k.done || (d++, o += k.tick(a));
                return c = o / d, q.update(K.tick(a, c)), n = B(), q.done() || e || r ? (q.update(100), Pace.trigger("done"), setTimeout(function() {
                    return q.finish(), Pace.running = !1, Pace.trigger("hide")
                }, Math.max(C.ghostTime, Math.min(C.minTime, B() - n)))) : b()
            })
        }, Pace.start = function(a) {
            u(C, a), Pace.running = !0;
            try {
                q.render()
            } catch (b) {
                i = b
            }
            return document.querySelector(".pace") ? (Pace.trigger("start"), Pace.go()) : setTimeout(Pace.start, 50)
        }, "function" == typeof define && define.amd ? define('theme-app', [], function() {
            return Pace
        }) : "object" == typeof exports ? module.exports = Pace : C.startOnPageLoad && Pace.start()
    }).call(this);
});

/* 
 * BOX REFRESH BUTTON 
 * ------------------
 * This is a custom plugin to use with the compenet BOX. It allows you to add
 * a refresh button to the box. It converts the box's state to a loading state.
 * 
 * USAGE:
 *  $("#box-widget").boxRefresh( options );
 * */
(function($) {
    "use strict";

    $.fn.boxRefresh = function(options) {

        // Render options
        var settings = $.extend({
            //Refressh button selector
            trigger: ".refresh-btn",
            //File source to be loaded (e.g: ajax/src.php)
            source: "",
            //Callbacks
            onLoadStart: function(box) {
            }, //Right after the button has been clicked
            onLoadDone: function(box) {
            } //When the source has been loaded

        }, options);

        //The overlay
        var overlay = $('<div class="overlay"></div><div class="loading-img"></div>');

        return this.each(function() {
            //if a source is specified
            if (settings.source === "") {
                if (console) {
                    console.log("Please specify a source first - boxRefresh()");
                }
                return;
            }
            //the box
            var box = $(this);
            //the button
            var rBtn = box.find(settings.trigger).first();

            //On trigger click
            rBtn.click(function(e) {
                e.preventDefault();
                //Add loading overlay
                start(box);

                //Perform ajax call
                box.find(".box-body").load(settings.source, function() {
                    done(box);
                });


            });

        });

        function start(box) {
            //Add overlay and loading img
            box.append(overlay);

            settings.onLoadStart.call(box);
        }

        function done(box) {
            //Remove overlay and loading img
            box.find(overlay).remove();

            settings.onLoadDone.call(box);
        }

    };

})(jQuery);

/*
 * SIDEBAR MENU
 * ------------
 * This is a custom plugin for the sidebar menu. It provides a tree view.
 * 
 * Usage:
 * $(".sidebar).tree();
 * 
 * Note: This plugin does not accept any options. Instead, it only requires a class
 *       added to the element that contains a sub-menu.
 *       
 * When used with the sidebar, for example, it would look something like this:
 * <ul class='sidebar-menu'>
 *      <li class="treeview active">
 *          <a href="#>Menu</a>
 *          <ul class='treeview-menu'>
 *              <li class='active'><a href=#>Level 1</a></li>
 *          </ul>
 *      </li>
 * </ul>
 * 
 * Add .active class to <li> elements if you want the menu to be open automatically
 * on page load. See above for an example.
 */
(function($) {
    "use strict";

    $.fn.tree = function() {

        return this.each(function() {
            var btn = $(this).children("a").first();
            var menu = $(this).children(".treeview-menu").first();
            var isActive = $(this).hasClass('active');

            //initialize already active menus
            if (isActive) {
                menu.show();
                btn.children(".fa-angle-left").first().removeClass("fa-angle-left").addClass("fa-angle-down");
            }
            //Slide open or close the menu on link click
            btn.click(function(e) {
                e.preventDefault();
                if (isActive) {
                    //Slide up to close menu
                    menu.slideUp();
                    isActive = false;
                    btn.children(".fa-angle-down").first().removeClass("fa-angle-down").addClass("fa-angle-left");
                    btn.parent("li").removeClass("active");
                } else {
                    //Slide down to open menu
                    menu.slideDown();
                    isActive = true;
                    btn.children(".fa-angle-left").first().removeClass("fa-angle-left").addClass("fa-angle-down");
                    btn.parent("li").addClass("active");
                }
            });

            /* Add margins to submenu elements to give it a tree look */
            menu.find("li > a").each(function() {
                var pad = parseInt($(this).css("margin-left")) + 10;

                $(this).css({"margin-left": pad + "px"});
            });

        });

    };


}(jQuery));

/*
 * TODO LIST CUSTOM PLUGIN
 * -----------------------
 * This plugin depends on iCheck plugin for checkbox and radio inputs
 */
(function($) {
    "use strict";

    $.fn.todolist = function(options) {
        // Render options
        var settings = $.extend({
            //When the user checks the input
            onCheck: function(ele) {
            },
            //When the user unchecks the input
            onUncheck: function(ele) {
            }
        }, options);

        return this.each(function() {
            $('input', this).on('ifChecked', function(event) {
                var ele = $(this).parents("li").first();
                ele.toggleClass("done");
                settings.onCheck.call(ele);
            });

            $('input', this).on('ifUnchecked', function(event) {
                var ele = $(this).parents("li").first();
                ele.toggleClass("done");
                settings.onUncheck.call(ele);
            });
        });
    };

}(jQuery));

/* CENTER ELEMENTS */
(function($) {
    "use strict";
    jQuery.fn.center = function(parent) {
        if (parent) {
            parent = this.parent();
        } else {
            parent = window;
        }
        this.css({
            "position": "absolute",
            "top": ((($(parent).height() - this.outerHeight()) / 2) + $(parent).scrollTop() + "px"),
            "left": ((($(parent).width() - this.outerWidth()) / 2) + $(parent).scrollLeft() + "px")
        });
        return this;
    }
}(jQuery));

/*
 * jQuery resize event - v1.1 - 3/14/2010
 * http://benalman.com/projects/jquery-resize-plugin/
 * 
 * Copyright (c) 2010 "Cowboy" Ben Alman
 * Dual licensed under the MIT and GPL licenses.
 * http://benalman.com/about/license/
 */
(function($, h, c) {
    var a = $([]), e = $.resize = $.extend($.resize, {}), i, k = "setTimeout", j = "resize", d = j + "-special-event", b = "delay", f = "throttleWindow";
    e[b] = 250;
    e[f] = true;
    $.event.special[j] = {setup: function() {
            if (!e[f] && this[k]) {
                return false;
            }
            var l = $(this);
            a = a.add(l);
            $.data(this, d, {w: l.width(), h: l.height()});
            if (a.length === 1) {
                g();
            }
        }, teardown: function() {
            if (!e[f] && this[k]) {
                return false
            }
            var l = $(this);
            a = a.not(l);
            l.removeData(d);
            if (!a.length) {
                clearTimeout(i);
            }
        }, add: function(l) {
            if (!e[f] && this[k]) {
                return false
            }
            var n;
            function m(s, o, p) {
                var q = $(this), r = $.data(this, d);
                r.w = o !== c ? o : q.width();
                r.h = p !== c ? p : q.height();
                n.apply(this, arguments)
            }
            if ($.isFunction(l)) {
                n = l;
                return m
            } else {
                n = l.handler;
                l.handler = m
            }
        }};
    function g() {
        if(typeof h[k] == 'function'){
        i = h[k](function() {
            a.each(function() {
                var n = $(this), m = n.width(), l = n.height(), o = $.data(this, d);
                if (m !== o.w || l !== o.h) {
                    n.trigger(j, [o.w = m, o.h = l])
                }
            });
            g()
        }, e[b])
        }
    }}
)(jQuery, this);

/*!
 * SlimScroll https://github.com/rochal/jQuery-slimScroll
 * =======================================================
 * 
 * Copyright (c) 2011 Piotr Rochala (http://rocha.la) Dual licensed under the MIT 
 */
(function(f) {
    jQuery.fn.extend({slimScroll: function(h) {
            var a = f.extend({width: "auto", height: "250px", size: "7px", color: "#000", position: "right", distance: "1px", start: "top", opacity: 0.4, alwaysVisible: !1, disableFadeOut: !1, railVisible: !1, railColor: "#333", railOpacity: 0.2, railDraggable: !0, railClass: "slimScrollRail", barClass: "slimScrollBar", wrapperClass: "slimScrollDiv", allowPageScroll: !1, wheelStep: 20, touchScrollStep: 200, borderRadius: "0px", railBorderRadius: "0px"}, h);
            this.each(function() {
                function r(d) {
                    if (s) {
                        d = d ||
                                window.event;
                        var c = 0;
                        d.wheelDelta && (c = -d.wheelDelta / 120);
                        d.detail && (c = d.detail / 3);
                        f(d.target || d.srcTarget || d.srcElement).closest("." + a.wrapperClass).is(b.parent()) && m(c, !0);
                        d.preventDefault && !k && d.preventDefault();
                        k || (d.returnValue = !1)
                    }
                }
                function m(d, f, h) {
                    k = !1;
                    var e = d, g = b.outerHeight() - c.outerHeight();
                    f && (e = parseInt(c.css("top")) + d * parseInt(a.wheelStep) / 100 * c.outerHeight(), e = Math.min(Math.max(e, 0), g), e = 0 < d ? Math.ceil(e) : Math.floor(e), c.css({top: e + "px"}));
                    l = parseInt(c.css("top")) / (b.outerHeight() - c.outerHeight());
                    e = l * (b[0].scrollHeight - b.outerHeight());
                    h && (e = d, d = e / b[0].scrollHeight * b.outerHeight(), d = Math.min(Math.max(d, 0), g), c.css({top: d + "px"}));
                    b.scrollTop(e);
                    b.trigger("slimscrolling", ~~e);
                    v();
                    p()
                }
                function C() {
                    window.addEventListener ? (this.addEventListener("DOMMouseScroll", r, !1), this.addEventListener("mousewheel", r, !1), this.addEventListener("MozMousePixelScroll", r, !1)) : document.attachEvent("onmousewheel", r)
                }
                function w() {
                    u = Math.max(b.outerHeight() / b[0].scrollHeight * b.outerHeight(), D);
                    c.css({height: u + "px"});
                    var a = u == b.outerHeight() ? "none" : "block";
                    c.css({display: a})
                }
                function v() {
                    w();
                    clearTimeout(A);
                    l == ~~l ? (k = a.allowPageScroll, B != l && b.trigger("slimscroll", 0 == ~~l ? "top" : "bottom")) : k = !1;
                    B = l;
                    u >= b.outerHeight() ? k = !0 : (c.stop(!0, !0).fadeIn("fast"), a.railVisible && g.stop(!0, !0).fadeIn("fast"))
                }
                function p() {
                    a.alwaysVisible || (A = setTimeout(function() {
                        a.disableFadeOut && s || (x || y) || (c.fadeOut("slow"), g.fadeOut("slow"))
                    }, 1E3))
                }
                var s, x, y, A, z, u, l, B, D = 30, k = !1, b = f(this);
                if (b.parent().hasClass(a.wrapperClass)) {
                    var n = b.scrollTop(),
                            c = b.parent().find("." + a.barClass), g = b.parent().find("." + a.railClass);
                    w();
                    if (f.isPlainObject(h)) {
                        if ("height"in h && "auto" == h.height) {
                            b.parent().css("height", "auto");
                            b.css("height", "auto");
                            var q = b.parent().parent().height();
                            b.parent().css("height", q);
                            b.css("height", q)
                        }
                        if ("scrollTo"in h)
                            n = parseInt(a.scrollTo);
                        else if ("scrollBy"in h)
                            n += parseInt(a.scrollBy);
                        else if ("destroy"in h) {
                            c.remove();
                            g.remove();
                            b.unwrap();
                            return
                        }
                        m(n, !1, !0)
                    }
                } else {
                    a.height = "auto" == a.height ? b.parent().height() : a.height;
                    n = f("<div></div>").addClass(a.wrapperClass).css({position: "relative",
                        overflow: "hidden", width: a.width, height: a.height});
                    b.css({overflow: "hidden", width: a.width, height: a.height});
                    var g = f("<div></div>").addClass(a.railClass).css({width: a.size, height: "100%", position: "absolute", top: 0, display: a.alwaysVisible && a.railVisible ? "block" : "none", "border-radius": a.railBorderRadius, background: a.railColor, opacity: a.railOpacity, zIndex: 90}), c = f("<div></div>").addClass(a.barClass).css({background: a.color, width: a.size, position: "absolute", top: 0, opacity: a.opacity, display: a.alwaysVisible ?
                                "block" : "none", "border-radius": a.borderRadius, BorderRadius: a.borderRadius, MozBorderRadius: a.borderRadius, WebkitBorderRadius: a.borderRadius, zIndex: 99}), q = "right" == a.position ? {right: a.distance} : {left: a.distance};
                    g.css(q);
                    c.css(q);
                    b.wrap(n);
                    b.parent().append(c);
                    b.parent().append(g);
                    a.railDraggable && c.bind("mousedown", function(a) {
                        var b = f(document);
                        y = !0;
                        t = parseFloat(c.css("top"));
                        pageY = a.pageY;
                        b.bind("mousemove.slimscroll", function(a) {
                            currTop = t + a.pageY - pageY;
                            c.css("top", currTop);
                            m(0, c.position().top, !1)
                        });
                        b.bind("mouseup.slimscroll", function(a) {
                            y = !1;
                            p();
                            b.unbind(".slimscroll")
                        });
                        return!1
                    }).bind("selectstart.slimscroll", function(a) {
                        a.stopPropagation();
                        a.preventDefault();
                        return!1
                    });
                    g.hover(function() {
                        v()
                    }, function() {
                        p()
                    });
                    c.hover(function() {
                        x = !0
                    }, function() {
                        x = !1
                    });
                    b.hover(function() {
                        s = !0;
                        v();
                        p()
                    }, function() {
                        s = !1;
                        p()
                    });
                    b.bind("touchstart", function(a, b) {
                        a.originalEvent.touches.length && (z = a.originalEvent.touches[0].pageY)
                    });
                    b.bind("touchmove", function(b) {
                        k || b.originalEvent.preventDefault();
                        b.originalEvent.touches.length &&
                                (m((z - b.originalEvent.touches[0].pageY) / a.touchScrollStep, !0), z = b.originalEvent.touches[0].pageY)
                    });
                    w();
                    "bottom" === a.start ? (c.css({top: b.outerHeight() - c.outerHeight()}), m(0, !0)) : "top" !== a.start && (m(f(a.start).position().top, null, !0), a.alwaysVisible || c.hide());
                    C()
                }
            });
            return this
        }});
    jQuery.fn.extend({slimscroll: jQuery.fn.slimScroll})
})(jQuery);

/*! iCheck v1.0.1 by Damir Sultanov, http://git.io/arlzeA, MIT Licensed */
(function(h) {
    function F(a, b, d) {
        var c = a[0], e = /er/.test(d) ? m : /bl/.test(d) ? s : l, f = d == H ? {checked: c[l], disabled: c[s], indeterminate: "true" == a.attr(m) || "false" == a.attr(w)} : c[e];
        if (/^(ch|di|in)/.test(d) && !f)
            D(a, e);
        else if (/^(un|en|de)/.test(d) && f)
            t(a, e);
        else if (d == H)
            for (e in f)
                f[e] ? D(a, e, !0) : t(a, e, !0);
        else if (!b || "toggle" == d) {
            if (!b)
                a[p]("ifClicked");
            f ? c[n] !== u && t(a, e) : D(a, e)
        }
    }
    function D(a, b, d) {
        var c = a[0], e = a.parent(), f = b == l, A = b == m, B = b == s, K = A ? w : f ? E : "enabled", p = k(a, K + x(c[n])), N = k(a, b + x(c[n]));
        if (!0 !== c[b]) {
            if (!d &&
                    b == l && c[n] == u && c.name) {
                var C = a.closest("form"), r = 'input[name="' + c.name + '"]', r = C.length ? C.find(r) : h(r);
                r.each(function() {
                    this !== c && h(this).data(q) && t(h(this), b)
                })
            }
            A ? (c[b] = !0, c[l] && t(a, l, "force")) : (d || (c[b] = !0), f && c[m] && t(a, m, !1));
            L(a, f, b, d)
        }
        c[s] && k(a, y, !0) && e.find("." + I).css(y, "default");
        e[v](N || k(a, b) || "");
        B ? e.attr("aria-disabled", "true") : e.attr("aria-checked", A ? "mixed" : "true");
        e[z](p || k(a, K) || "")
    }
    function t(a, b, d) {
        var c = a[0], e = a.parent(), f = b == l, h = b == m, q = b == s, p = h ? w : f ? E : "enabled", t = k(a, p + x(c[n])),
                u = k(a, b + x(c[n]));
        if (!1 !== c[b]) {
            if (h || !d || "force" == d)
                c[b] = !1;
            L(a, f, p, d)
        }
        !c[s] && k(a, y, !0) && e.find("." + I).css(y, "pointer");
        e[z](u || k(a, b) || "");
        q ? e.attr("aria-disabled", "false") : e.attr("aria-checked", "false");
        e[v](t || k(a, p) || "")
    }
    function M(a, b) {
        if (a.data(q)) {
            a.parent().html(a.attr("style", a.data(q).s || ""));
            if (b)
                a[p](b);
            a.off(".i").unwrap();
            h(G + '[for="' + a[0].id + '"]').add(a.closest(G)).off(".i")
        }
    }
    function k(a, b, d) {
        if (a.data(q))
            return a.data(q).o[b + (d ? "" : "Class")]
    }
    function x(a) {
        return a.charAt(0).toUpperCase() +
                a.slice(1)
    }
    function L(a, b, d, c) {
        if (!c) {
            if (b)
                a[p]("ifToggled");
            a[p]("ifChanged")[p]("if" + x(d))
        }
    }
    var q = "iCheck", I = q + "-helper", u = "radio", l = "checked", E = "un" + l, s = "disabled", w = "determinate", m = "in" + w, H = "update", n = "type", v = "addClass", z = "removeClass", p = "trigger", G = "label", y = "cursor", J = /ipad|iphone|ipod|android|blackberry|windows phone|opera mini|silk/i.test(navigator.userAgent);
    h.fn[q] = function(a, b) {
        var d = 'input[type="checkbox"], input[type="' + u + '"]', c = h(), e = function(a) {
            a.each(function() {
                var a = h(this);
                c = a.is(d) ?
                        c.add(a) : c.add(a.find(d))
            })
        };
        if (/^(check|uncheck|toggle|indeterminate|determinate|disable|enable|update|destroy)$/i.test(a))
            return a = a.toLowerCase(), e(this), c.each(function() {
                var c = h(this);
                "destroy" == a ? M(c, "ifDestroyed") : F(c, !0, a);
                h.isFunction(b) && b()
            });
        if ("object" != typeof a && a)
            return this;
        var f = h.extend({checkedClass: l, disabledClass: s, indeterminateClass: m, labelHover: !0, aria: !1}, a), k = f.handle, B = f.hoverClass || "hover", x = f.focusClass || "focus", w = f.activeClass || "active", y = !!f.labelHover, C = f.labelHoverClass ||
                "hover", r = ("" + f.increaseArea).replace("%", "") | 0;
        if ("checkbox" == k || k == u)
            d = 'input[type="' + k + '"]';
        -50 > r && (r = -50);
        e(this);
        return c.each(function() {
            var a = h(this);
            M(a);
            var c = this, b = c.id, e = -r + "%", d = 100 + 2 * r + "%", d = {position: "absolute", top: e, left: e, display: "block", width: d, height: d, margin: 0, padding: 0, background: "#fff", border: 0, opacity: 0}, e = J ? {position: "absolute", visibility: "hidden"} : r ? d : {position: "absolute", opacity: 0}, k = "checkbox" == c[n] ? f.checkboxClass || "icheckbox" : f.radioClass || "i" + u, m = h(G + '[for="' + b + '"]').add(a.closest(G)),
                    A = !!f.aria, E = q + "-" + Math.random().toString(36).replace("0.", ""), g = '<div class="' + k + '" ' + (A ? 'role="' + c[n] + '" ' : "");
            m.length && A && m.each(function() {
                g += 'aria-labelledby="';
                this.id ? g += this.id : (this.id = E, g += E);
                g += '"'
            });
            g = a.wrap(g + "/>")[p]("ifCreated").parent().append(f.insert);
            d = h('<ins class="' + I + '"/>').css(d).appendTo(g);
            a.data(q, {o: f, s: a.attr("style")}).css(e);
            f.inheritClass && g[v](c.className || "");
            f.inheritID && b && g.attr("id", q + "-" + b);
            "static" == g.css("position") && g.css("position", "relative");
            F(a, !0, H);
            if (m.length)
                m.on("click.i mouseover.i mouseout.i touchbegin.i touchend.i", function(b) {
                    var d = b[n], e = h(this);
                    if (!c[s]) {
                        if ("click" == d) {
                            if (h(b.target).is("a"))
                                return;
                            F(a, !1, !0)
                        } else
                            y && (/ut|nd/.test(d) ? (g[z](B), e[z](C)) : (g[v](B), e[v](C)));
                        if (J)
                            b.stopPropagation();
                        else
                            return!1
                    }
                });
            a.on("click.i focus.i blur.i keyup.i keydown.i keypress.i", function(b) {
                var d = b[n];
                b = b.keyCode;
                if ("click" == d)
                    return!1;
                if ("keydown" == d && 32 == b)
                    return c[n] == u && c[l] || (c[l] ? t(a, l) : D(a, l)), !1;
                if ("keyup" == d && c[n] == u)
                    !c[l] && D(a, l);
                else if (/us|ur/.test(d))
                    g["blur" ==
                            d ? z : v](x)
            });
            d.on("click mousedown mouseup mouseover mouseout touchbegin.i touchend.i", function(b) {
                var d = b[n], e = /wn|up/.test(d) ? w : B;
                if (!c[s]) {
                    if ("click" == d)
                        F(a, !1, !0);
                    else {
                        if (/wn|er|in/.test(d))
                            g[v](e);
                        else
                            g[z](e + " " + w);
                        if (m.length && y && e == B)
                            m[/ut|nd/.test(d) ? z : v](C)
                    }
                    if (J)
                        b.stopPropagation();
                    else
                        return!1
                }
            })
        })
    }
})(window.jQuery || window.Zepto);
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/AdminLTE\\app.js","/AdminLTE")
},{"buffer":1,"htZkx4":4}],33:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/*
 * Author: Abdullah A Almsaeed
 * Date: 4 Jan 2014
 * Description:
 *      This is a demo file used only for the main dashboard (index.html)
 **/

$(function() {
    "use strict";


});
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/AdminLTE\\dashboard.js","/AdminLTE")
},{"buffer":1,"htZkx4":4}],34:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
$(function() {
    /* For demo purposes */
    var demo = $("<div />").css({
        position: "fixed",
        top: "150px",
        right: "0",
        background: "rgba(0, 0, 0, 0.7)",
        "border-radius": "5px 0px 0px 5px",
        padding: "10px 15px",
        "font-size": "16px",
        "z-index": "999999",
        cursor: "pointer",
        color: "#ddd"
    }).html("<i class='fa fa-gear'></i>").addClass("no-print");

    var demo_settings = $("<div />").css({
        "padding": "10px",
        position: "fixed",
        top: "130px",
        right: "-200px",
        background: "#fff",
        border: "3px solid rgba(0, 0, 0, 0.7)",
        "width": "200px",
        "z-index": "999999"
    }).addClass("no-print");
    demo_settings.append(
            "<h4 style='margin: 0 0 5px 0; border-bottom: 1px dashed #ddd; padding-bottom: 3px;'>Layout Options</h4>"
            + "<div class='form-group no-margin'>"
            + "<div class='.checkbox'>"
            + "<label>"
            + "<input type='checkbox' onchange='change_layout();'/> "
            + "Fixed layout"
            + "</label>"
            + "</div>"
            + "</div>"
            );
    demo_settings.append(
            "<h4 style='margin: 0 0 5px 0; border-bottom: 1px dashed #ddd; padding-bottom: 3px;'>Skins</h4>"
            + "<div class='form-group no-margin'>"
            + "<div class='.radio'>"
            + "<label>"
            + "<input name='skins' type='radio' onchange='change_skin(\"skin-black\");' /> "
            + "Black"
            + "</label>"
            + "</div>"
            + "</div>"

            + "<div class='form-group no-margin'>"
            + "<div class='.radio'>"
            + "<label>"
            + "<input name='skins' type='radio' onchange='change_skin(\"skin-blue\");' checked='checked'/> "
            + "Blue"
            + "</label>"
            + "</div>"
            + "</div>"
            );

    demo.click(function() {
        if (!$(this).hasClass("open")) {
            $(this).css("right", "200px");
            demo_settings.css("right", "0");
            $(this).addClass("open");
        } else {
            $(this).css("right", "0");
            demo_settings.css("right", "-200px");
            $(this).removeClass("open")
        }
    });

    $("body").append(demo);
    $("body").append(demo_settings);
});
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/AdminLTE\\demo.js","/AdminLTE")
},{"buffer":1,"htZkx4":4}],35:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
require('./AdminLTE/app');
require('./AdminLTE/dashboard');
require('./AdminLTE/demo');

require('../controllers/_module_init');
require('../services/_module_init');
require('../directives/_module_init');
require('../config/_module_init');
require('../controls/_module_init');

angular.element(document).ready(function() {

	var requires = [
		'ui.router',
		'ngResource',
		'app.config',
		'app.controls',
		'app.controllers',
		'app.services',
		'app.directives',
	];

	var app = angular.module('app', requires);

	app.config(['$httpProvider', '$sceDelegateProvider',
		function($httpProvider, $sceDelegateProvider) {
			$httpProvider.defaults.useXDomain = true;
			$sceDelegateProvider.resourceUrlWhitelist(['self', /^https?:\/\/(cdn\.)?quadramma.com/]);
			delete $httpProvider.defaults.headers.common['X-Requested-With'];
		}
	]);

	app.run([
		'$QJConfig',
		function($QJConfig) {
			//store.clear();
			$QJConfig.configure();
		}
	]);


	angular.bootstrap(document, ['app']);

});
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/fake_3df4f13e.js","/")
},{"../config/_module_init":5,"../controllers/_module_init":7,"../controls/_module_init":22,"../directives/_module_init":28,"../services/_module_init":36,"./AdminLTE/app":32,"./AdminLTE/dashboard":33,"./AdminLTE/demo":34,"buffer":1,"htZkx4":4}],36:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
module.exports = angular.module('app.services', []);
require('./apiService.js');
require('./authService.js');
require('./configService.js');
require('./errorHandlerService.js');
require('./helperService.js')
require('./localSessionService.js');
require('./loggerService.js');
require('./loginService.js');
require('./timeService.js');
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\services\\_module_init.js","/..\\services")
},{"./apiService.js":37,"./authService.js":38,"./configService.js":39,"./errorHandlerService.js":40,"./helperService.js":41,"./localSessionService.js":42,"./loggerService.js":43,"./loginService.js":44,"./timeService.js":45,"buffer":1,"htZkx4":4}],37:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.factory('$QJApi', ['$QJTime', '$QJLocalSession', '$QJLogger', "$QJConfig", "$resource", '$QJErrorHandler', '$rootScope',
	function($QJTime, $QJLocalSession, $QJLogger, $QJConfig, $resource, $QJErrorHandler, $rootScope) {
		var rta = new(function() {

			//api in root
			if (_.isUndefined($rootScope.api)) {
				var _apiInfo = {
					status: 'Waiting',
					calls: [],
					calls_working: 0,
					calls_finished: 0,
					callsInProgress: function() {
						var asd = (_.filter(_apiInfo.calls, function(call) {
							return call.ended = true;
						})).length();

						return 0;
					},
					start: function(info) {
						var call = {
							info: info,
							ended: false,
							startTime: (new Date()).getTime(),
							endTime: null,
							duration: null
						};
						_apiInfo.calls_working += 1;
						_apiInfo.status = 'Working';
						_apiInfo.calls.push(call);
						return { //represents the call
							end: function() {
								call.ended = true;
								call.endTime = (new Date()).getTime();
								call.duration = (call.startTime - call.endTime) / 100; //dur in secs.
								_apiInfo.calls_working -= 1;
								_apiInfo.calls_finished += 1;
								if (_apiInfo.calls_working == 0) {
									_apiInfo.status = 'Waiting';
								}
							}
						};
					},
					buildCacheItemId: function(ctrlName, params, postData) {
						var concat = ctrlName;
						for (var x in params) {
							var param = params[x];
							concat += param;
						}
						for (var x in postData) {
							var data = postData[x];
							concat += data;
						}
						return concat;
					},
					newCacheItemFunct: function(cacheItem) {
						cacheItem.setRes = function(res) {
							var self = this;
							$QJLocalSession.add(function(session) {
								session.httpcache[self.index].res = res;
							});
						};
						cacheItem.hasRes = function() {
							return this.res != null;
						};
						return cacheItem;
					},
					newCacheItem: function(params) {
						var rta = {
							id: params.id,
							index: params.index,
							params: {},
							postData: {},
							res: null,
							expiration: (new Date()).getTime(),
							expirein: $QJTime.getTimestampDuration(
								$rootScope.config.cache_expiration_minutes / 1000
							)
						};
						rta = this.newCacheItemFunct(rta);
						return rta;
					},
					getCache: function(ctrlName, params, postData) {
						var self = this;
						var id = this.buildCacheItemId(ctrlName, params, postData);

						if (!_.isUndefined(params.ignorecache) && params.ignorecache == true) {
							return {
								hasRes: function() {
									return false;
								},
								setRes: function() {}
							}
						}

						if (!$rootScope.session.httpcache) $rootScope.session.httpcache = [];
						//tryget
						var rtacache = null;
						for (var x in $rootScope.session.httpcache) {
							var item = $rootScope.session.httpcache[x];
							if (item.id == id) {
								rtacache = item;

								var diff =
									(rtacache.expiration + ((parseInt($rootScope.config.cache_expiration_minutes) * 60) * 1000)) -
									(new Date()).getTime();
								if (diff < 0) {
									rtacache = null;
									$rootScope.session.httpcache.splice(x, 1);
								} else {

									rtacache.expirein =
										$QJTime.getTimestampDuration(diff);
								}
								break;
							}
						}
						if (_.isUndefined(rtacache) || _.isNull(rtacache)) {
							var newItem = self.newCacheItem({
								id: id,
								index: $rootScope.session.httpcache.length
							});
							$rootScope.session.httpcache.push({
								id: newItem.id,
								index: newItem.index,
								params: newItem.params,
								postData: newItem.postData,
								res: newItem.res,
								expiration: newItem.expiration,
								expiration_seconds: newItem.expiration_seconds
							});
							$QJLocalSession.save();
							return newItem;
						} else {
							rtacache = self.newCacheItemFunct(rtacache);
							return rtacache;
						}
					}
				};

				/*
				var call = _apiInfo.start({
					description: 'Test task for api'
				});
				call.end();
				*/

				$rootScope.api = _apiInfo;
				gapi = $rootScope.api;
			}



			//--CLASS DEF
			var self = this;

			//PRIVATEE
			function hasReportedErrors(res, ignoreBadRequest) {
				if (res && _.isUndefined(res.ok)) {
					//console.log(res);
					$QJErrorHandler.handle($QJErrorHandler.codes.API_INVALID_RESPONSE, res);
					return true;
				}
				if (res && !_.isUndefined(res.ok) && res.ok == false && !ignoreBadRequest) {

					if (res && !_.isUndefined(res.errorcode)) {
						$QJLogger.log('api warning -> handling errorcode ' + res.errorcode);
						$QJErrorHandler.handle(res.errorcode, res);
						return true;
					} else {
						$QJErrorHandler.handle($QJErrorHandler.API_RESPONSE_HAS_ERRORS_WITHOUT_ERRORCODE, res);
						return true;
					}

					$QJErrorHandler.handle($QJErrorHandler.codes.API_RESPONSE_HAS_ERRORS, res);
					return true;
				}
				return false;
			}

			function getController(controllerName, ignoreBadRequest) {
				var $res = $resource($rootScope.config.api + '/:controller/:action/:id', {}, {
					query: {
						method: "GET",
						isArray: true
					},
					get: {
						method: "GET",
						isArray: false,
						params: {
							controller: controllerName
						}
					},
					request: {
						method: 'POST',
						isArray: false,
						params: {
							controller: controllerName
						}
					},
					save: {
						method: 'POST',
						isArray: false
					},
					update: {
						method: 'POST',
						isArray: false
					},
					delete: {
						method: "DELETE",
						isArray: false
					}
				});
				var controller = {};
				controller.hasReportedErrors = hasReportedErrors;
				controller.post = function(params, postData, success) {

					var cache = $rootScope.api.getCache(controllerName, params, postData);
					if (cache.hasRes()) {
						if (!hasReportedErrors(cache.res, ignoreBadRequest)) {
							success(cache.res);
						}
						return;
					}

					var call = $rootScope.api.start(params);

					if (params && params.ignorecache) {
						delete(params.ignorecache);
					}

					$res.request(params, postData, function(res) {
						call.end();
						if (!hasReportedErrors(res, ignoreBadRequest)) {
							success(res);
							cache.setRes(res);
						}
					}, function() {
						call.end();
						$QJErrorHandler.handle($QJErrorHandler.codes.API_ERROR);
					});
				}
				controller.get = function(params, success) {
					var cache = $rootScope.api.getCache(controllerName, params, {});
					if (cache.hasRes()) {
						if (!hasReportedErrors(cache.res, ignoreBadRequest)) {
							success(cache.res);
						}
						return;
					}

					var call = $rootScope.api.start(params);

					if (params && params.ignorecache) {
						delete(params.ignorecache);
					}

					$res.get(params, function(res) {
						call.end();
						if (!hasReportedErrors(res, ignoreBadRequest)) {
							success(res);
							cache.setRes(res);
						}
					}, function(res) {
						call.end();
						if (res && !_.isUndefined(res.status) && res.status == 500) {
							$QJErrorHandler.handle($QJErrorHandler.codes.API_INTERNAL_SERVER_ERROR);
							return;
						}

						$QJErrorHandler.handle($QJErrorHandler.codes.API_ERROR);
					});
				};

				return controller;
			}

			//PUBLIC --------------------------------------
			self.getController = function(controllerName) {
				return getController(controllerName, false);
			};
			self.getLoginController = function(controllerName) {
				console.info("login controller return");
				return getController(controllerName, true);
			};
			self.isOK = function(success, failure) {
				//Check api status
				var Test = self.getController("test");
				Test.get({
					action: "status"
				}, function(res) {
					if (res && !_.isUndefined(res.ok) && res.ok == true) {
						success();
					} else {
						failure();
					}
				})
			};
			return self;
			//--CLASS DEF
		})();
		return rta; //factory return
	}
]);
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\services\\apiService.js","/..\\services")
},{"./_module_init.js":36,"buffer":1,"htZkx4":4}],38:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.factory('$QJAuth', ['$QJLogger', "$rootScope", "$http", '$QJLocalSession',
	function($QJLogger, $rootScope, $http, $QJLocalSession) {
		return {
			updateSessionCustom: function(token, _group_id) {
				$rootScope.session.token = token;
				$rootScope.session._group_id = _group_id;
				$rootScope.config._group_id = _group_id;
				$QJLocalSession.save();
				$rootScope.$emit('session.change');
				$QJLogger.log('QJAuth -> updateSessionCustom -> token ->' + token);
			},
			updateSessionFromLogin: function(res) {
				$rootScope.session.loginname = res.loginname;
				$rootScope.session.token = res.token;
				$rootScope.session.tokenReq = res.tokenReq;
				$rootScope.session.tokenExp = res.tokenExp;
				$rootScope.session._group_id = $rootScope.config._group_id;
				$QJLocalSession.save();
				$rootScope.$emit('session.change');
				$QJLogger.log('QJAuth -> updateSessionFromLogin -> token ->' + res.token);

			}
		}
	}
]);
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\services\\authService.js","/..\\services")
},{"./_module_init.js":36,"buffer":1,"htZkx4":4}],39:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.factory('$QJConfig', ['$QJLogger', '$rootScope', '$state', '$timeout', '$QJLocalSession', '$QJAuth',
	function($QJLogger, $rootScope, $state, $timeout, $QJLocalSession, $QJAuth) {
		var self = {
			appName: 'QJ',
			AppIdentifier: "AppIdentifier_NAME",
			//api: "http://localhost/qjarvis/api", //SIN '/' AL FINAL
			//api: "http://www.quadramma.com/pruebas/qjarvis/api", //SIN '/' AL FINAL  
			api: (location.origin + location.pathname).toString().replace("admin", "api").substring(0, (location.origin + location.pathname).toString().replace("admin", "api").length - 1), //API IN SAME PLACE (admin,api) //SIN '/' AL FINAL
			facebookAppID: "815991785078819",
			_group_id: 2, //DEFAULT QJARVIS BACKEND (2)
			listviewEntriesPerPage: 5,
			htmlTitle: "QJarvis | Dashboard"
		};
		return {
			configure: function() {


				$.getJSON("config.json", function(data) {
					console.info('[CONFIG.JSON][OK]');
					self.api = data.api;
					self.cache_expiration_minutes = data.cache_expiration_minutes;
				});


				$rootScope.config = self;
				var localstoreSessionData = $QJLocalSession.load();
				session = localstoreSessionData;

				if ((session && session._group_id)) {
					session.config = self;
				}
				//
				self._group_id = (session && session._group_id) ? session._group_id : self._group_id; //updates config with session _group_id
				if (localstoreSessionData) {
					$rootScope.session = localstoreSessionData;
					$QJLocalSession.save();
					$QJLogger.log('QJConfig-> configure-> session initialized from localstore');
				} else {
					$QJLogger.log('QJConfig-> configure-> session initialized from zero');
					$rootScope.session = {
						loginname: "",
						token: null,
						tokenReq: null,
						tokenExp: null,
					};
				}
				//
				$rootScope.htmlTitle = $rootScope.config.htmlTitle;
				//
				$QJLogger.log('QJConfig-> configure-> success');
				//


				if (!$rootScope.session || ($rootScope.session && _.isUndefined($rootScope.session.tokenExp))) {
					$QJLogger.log('QJHelper -> Token -> not avaliable');
					$timeout(function() {
						$state.go('login', null);
					}, 0);
					return;
				}
				if ($rootScope.session && $rootScope.session.tokenExp == null) {
					$QJLogger.log('QJHelper -> Token -> not avaliable');
					$timeout(function() {
						$state.go('login', null);
					}, 0);
					return;
				}
				var milliNow = new Date().getTime();
				var milliDiff = milliNow - parseInt($rootScope.session.tokenExp);
				var expirationSeconds = (Math.abs(milliDiff) / 1000);

				if (milliDiff > 0) {
					$timeout(function() {
						$state.go('login', null);
					}, 0);
					$QJLogger.log('QJHelper -> Token -> expired');
				} else {
					$QJLogger.log('QJHelper -> Token -> expires in ' + expirationSeconds + ' seconds');
				}


			}
		};

	}
]);
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\services\\configService.js","/..\\services")
},{"./_module_init.js":36,"buffer":1,"htZkx4":4}],40:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.factory('$QJErrorHandler', [
    '$QJLogger', '$state', '$timeout', '$rootScope',
    function($QJLogger, $state, $timeout, $rootScope) {
        var codes = {
            API_ERROR: 0, //CLIENT SIDE
            API_INVALID_RESPONSE: 1, //CLIENT SIDE
            API_RESPONSE_HAS_ERRORS: 2, //SERVER SIDE KNOWS
            API_TOKEN_EXPIRED: 3, //SERVER SIDE KNOWS
            API_INVALID_TOKEN: 4, //SERVER SIDE KNOWS
            API_INVALID_CREDENTIALS: 5, //SERVER SIDE KNOWS
            API_ROUTE_NOT_FOUND: 6, //SERVER SIDE KNOWS
            API_RESPONSE_HAS_ERRORS_WITHOUT_ERRORCODE: 7,
            API_INTERNAL_SERVER_ERROR: 500
        };
        var changeState = function(stateName) {
            $timeout(function() {
                $state.go(stateName);
            });
        };
        return {
            codes: codes,
            handle: function(code, response) {
                $rootScope.lastResponse = response;


                var vals = _.map(response, function(num, key) {
                    return num
                });
                var contactenedResponse = '';
                for (var x in vals) {
                    contactenedResponse += vals[x];
                }
                contactenedResponse = contactenedResponse.toString().replace(",", "");

                $rootScope.lastResponseAsString = vals;
                //$rootScope.lastResponseAsString = JSON.stringify(response);

                $rootScope.error = {
                    message: "Server API no accesible. Intente nuevamente mas tarde o conctacte a soporte."
                }

                switch (code) {
                    case codes.API_ERROR:
                        changeState("error-api");
                        break;
                    case codes.API_INTERNAL_SERVER_ERROR:
                        $rootScope.error.message = '(500) Internal server error. Intente nuevamente mas tarde o conctacte a soporte.';
                        changeState("error-api");
                        break;
                    case codes.API_INVALID_RESPONSE:
                        //changeState("error-invalid-response");
                        console.warn("INVALID RESPONSE -> " + JSON.stringify(response).toLowerCase().replace(/[^a-zA-Z]+/g, "."));
                        break;
                    case codes.API_RESPONSE_HAS_ERRORS:
                        //changeState("error-response-has-errors");
                        console.warn(response.message + " -> " + response.url);
                        break;
                    case codes.API_RESPONSE_HAS_ERRORS_WITHOUT_ERRORCODE:
                        $rootScope.error.message = "[API_RESPONSE_HAS_ERRORS_WITHOUT_ERRORCODE][Message-> " + response.message + "]";
                        changeState("error-response-has-errors");
                        break;
                    case codes.API_TOKEN_EXPIRED:
                        $rootScope.error.message = 'Su session expiro';
                        changeState("login");
                        break;
                    case codes.API_INVALID_TOKEN:
                        $rootScope.error.message = 'Token invalid';
                        changeState("login");
                        break;
                    case codes.API_INVALID_CREDENTIALS:
                        $rootScope.error.message = "Credenciales invalidas";
                        changeState("login");
                        break;
                    case codes.API_ROUTE_NOT_FOUND:
                        $rootScope.error.message = response.message;
                        //changeState("error-response-has-errors");
                        //$QJLogger.log("API_ROUTE_NOT_FOUND->"+response.message);
                        console.warn(response.message + " -> " + response.url);
                        break;
                    default:
                        console.info("[QJErrorHandler][UNKNOW ERROR][CONTACT SUPPORT]");
                        break
                }
            }
        }
    }
]);
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\services\\errorHandlerService.js","/..\\services")
},{"./_module_init.js":36,"buffer":1,"htZkx4":4}],41:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.factory('$QJHelperFunctions', [
	'$QJLogger', '$QJApi', '$rootScope', '$state', '$timeout', '$QJErrorHandler',
	function($QJLogger, $QJApi, $rootScope, $state, $timeout, $QJErrorHandler) {
		var self = {};
		self.changeState = function(stateName, params, timeout) {
			$timeout(function() {
				$QJLogger.log('QJHelper -> State -> going to ' + stateName + '  | Current -> ' + $state.current.name);
				$state.go(stateName, params);
			}, timeout || 0);
		};
		self.checkTokenExpirationAndGoToLoginStateIfHasExpired = function() {
			if (!$rootScope.session || ($rootScope.session && _.isUndefined($rootScope.session.tokenExp))) {
				$QJLogger.log('QJHelper -> Token -> not avaliable');
				self.changeState('login');
				return;
			}
			if ($rootScope.session && $rootScope.session.tokenExp == null) {
				$QJLogger.log('QJHelper -> Token -> not avaliable');
				self.changeState('login');
				return;
			}
			var milliNow = new Date().getTime();
			var milliDiff = milliNow - parseInt($rootScope.session.tokenExp);
			var expirationSeconds = (Math.abs(milliDiff) / 1000);

			if (milliDiff > 0) {
				//Si es positivo significa que el tiempo actual es mayor al de exp, por lo que el token expiro.
				self.changeState('login');
				$QJLogger.log('QJHelper -> Token -> expired');
			} else {
				$QJLogger.log('QJHelper -> Token -> expires in ' + expirationSeconds + ' seconds');
			}
		};

		self.getTimestampDuration = function(timestamp) {
			var duration = {
				hours: Math.round(Math.floor(timestamp / 1000 / 60 / 60) % 24),
				minutes: Math.round(Math.floor(timestamp / 1000 / 60) % 60),
				seconds: Math.round(Math.floor(timestamp / 1000) % 60)
			};
			var str = "";
			str += duration.hours + ":";
			str += duration.minutes + ":";
			str += duration.seconds + "";
			return str;
		};



		/*
		self.checkAPIAndGoToApiErrorStateIfThereIsAProblem = function() {
			$QJApi.isOK(function() {
				$QJLogger.log('QJHelper -> API -> working');
			}, function() {
				$QJLogger.log('QJHelper -> API -> not avaliable');
				$QJErrorHandler.handle($QJErrorHandler.codes.API_TIMEOUT);
			});
		};
		*/
		return self;
	}
]);
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\services\\helperService.js","/..\\services")
},{"./_module_init.js":36,"buffer":1,"htZkx4":4}],42:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.factory('$QJLocalSession', [
	'$rootScope', '$http',
	function($rootScope, $http) {
		function save() {
			$http.defaults.headers.common['auth-token'] = $rootScope.session.token;
			store.set("qj_" + $rootScope.config.AppIdentifier + "_token", $rootScope.session.token);
			store.set("qj_" + $rootScope.config.AppIdentifier + "_session", $rootScope.session);
			session = $rootScope.session;
		}
		return {
			load: function() {
				return store.get("qj_" + $rootScope.config.AppIdentifier + "_session") || null;
			},
			add: function(cb) {
				$rootScope.session = store.get("qj_" + $rootScope.config.AppIdentifier + "_session") || null;
				cb($rootScope.session);
				save();
			},
			save: save
		}
	}
]);
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\services\\localSessionService.js","/..\\services")
},{"./_module_init.js":36,"buffer":1,"htZkx4":4}],43:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.factory('$QJLogger', [
	'$rootScope', '$state', '$timeout',
	function($rootScope, $state, $timeout) {
		return {
			log: function(msg) {
				var appName = $rootScope.config.appName;
				console.info('[' + appName + '][' + msg + ']');
			}
		}
	}
]);
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\services\\loggerService.js","/..\\services")
},{"./_module_init.js":36,"buffer":1,"htZkx4":4}],44:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.factory('$QJLoginModule', [

	'$QJLogger', '$QJAuth', "$QJConfig", "$QJApi", "$resource", "$rootScope", '$QJLocalSession',
	function($QJLogger, $QJAuth, $QJConfig, $QJApi, $resource, $rootScope, $QJLocalSession) {
		var rta = new(function() {
			//--CLASS DEF
			var self = this;
			//
			self.login = function(loginname, password, success, failure) {
				var reqData = {
					"loginname": loginname,
					"password": password,
					"tokenReq": new Date().getTime(),
					'_group_id': $rootScope.config._group_id,
				};
				$QJLogger.log('QJLoginModule -> reqData');
				//console.info(reqData);
				var Auth = $QJApi.getController("auth");
				Auth.post({
					action: "login",
					ignorecache:true
				}, reqData, function(res) {
					$QJLogger.log('QJLogin -> success');
					$QJAuth.updateSessionFromLogin(res);
					success();
				});
			};
			return self;
			//--CLASS DEF
		})();
		return rta; //factory return
	}
]);
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\services\\loginService.js","/..\\services")
},{"./_module_init.js":36,"buffer":1,"htZkx4":4}],45:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var module = require('./_module_init.js');
module.factory('$QJTime', [
	'$rootScope', '$state', '$timeout',
	function($rootScope, $state, $timeout) {
		var self = {};
		self.getTimestampDuration = function(timestamp) {
			var duration = {
				hours: Math.round(Math.floor(timestamp / 1000 / 60 / 60) % 24),
				minutes: Math.round(Math.floor(timestamp / 1000 / 60) % 60),
				seconds: Math.round(Math.floor(timestamp / 1000) % 60)
			};
			var str = "";
			str += duration.hours + ":";
			str += duration.minutes + ":";
			str += duration.seconds + "";
			return str;
		};
		return self;
	}
]);
}).call(this,require("htZkx4"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\services\\timeService.js","/..\\services")
},{"./_module_init.js":36,"buffer":1,"htZkx4":4}]},{},[35])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxVc2Vyc1xccXVhZHJhbW1hXFxnaXRcXHFqYXJ2aXMuY2xpZW50XFxub2RlX21vZHVsZXNcXGd1bHAtYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJyb3dzZXItcGFja1xcX3ByZWx1ZGUuanMiLCJDOi9Vc2Vycy9xdWFkcmFtbWEvZ2l0L3FqYXJ2aXMuY2xpZW50L25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9pbmRleC5qcyIsIkM6L1VzZXJzL3F1YWRyYW1tYS9naXQvcWphcnZpcy5jbGllbnQvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9iYXNlNjQtanMvbGliL2I2NC5qcyIsIkM6L1VzZXJzL3F1YWRyYW1tYS9naXQvcWphcnZpcy5jbGllbnQvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9pZWVlNzU0L2luZGV4LmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJDOi9Vc2Vycy9xdWFkcmFtbWEvZ2l0L3FqYXJ2aXMuY2xpZW50L3NyYy9qcy9jb25maWcvX21vZHVsZV9pbml0LmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvY29uZmlnL3JvdXRlcy5qcyIsIkM6L1VzZXJzL3F1YWRyYW1tYS9naXQvcWphcnZpcy5jbGllbnQvc3JjL2pzL2NvbnRyb2xsZXJzL19tb2R1bGVfaW5pdC5qcyIsIkM6L1VzZXJzL3F1YWRyYW1tYS9naXQvcWphcnZpcy5jbGllbnQvc3JjL2pzL2NvbnRyb2xsZXJzL2FwcEN0cmwuanMiLCJDOi9Vc2Vycy9xdWFkcmFtbWEvZ2l0L3FqYXJ2aXMuY2xpZW50L3NyYy9qcy9jb250cm9sbGVycy9jaGF0Q3RybC5qcyIsIkM6L1VzZXJzL3F1YWRyYW1tYS9naXQvcWphcnZpcy5jbGllbnQvc3JjL2pzL2NvbnRyb2xsZXJzL2hvbWVDdHJsLmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvY29udHJvbGxlcnMvbG9naW5DdHJsLmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvY29udHJvbGxlcnMvbW9kLm1lbnVDdHJsLmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvY29udHJvbGxlcnMvbW9kLnByb2ZpbGVDdHJsLmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvY29udHJvbGxlcnMvbW9kLnByb2plY3Rob3Vyc0N0cmwuanMiLCJDOi9Vc2Vycy9xdWFkcmFtbWEvZ2l0L3FqYXJ2aXMuY2xpZW50L3NyYy9qcy9jb250cm9sbGVycy9tb2QucHJvamVjdHNDdHJsLmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvY29udHJvbGxlcnMvbW9kLnVzZXJncm91cEN0cmwuanMiLCJDOi9Vc2Vycy9xdWFkcmFtbWEvZ2l0L3FqYXJ2aXMuY2xpZW50L3NyYy9qcy9jb250cm9sbGVycy9tb2QudXNlcnNDdHJsLmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvY29udHJvbGxlcnMvbmF2Q3RybC5qcyIsIkM6L1VzZXJzL3F1YWRyYW1tYS9naXQvcWphcnZpcy5jbGllbnQvc3JjL2pzL2NvbnRyb2xsZXJzL3NldHRpbmdzQ3RybC5qcyIsIkM6L1VzZXJzL3F1YWRyYW1tYS9naXQvcWphcnZpcy5jbGllbnQvc3JjL2pzL2NvbnRyb2xsZXJzL3NpZGViYXJDdHJsLmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvY29udHJvbGxlcnMvdnAuY29uZmlnQ3RybC5qcyIsIkM6L1VzZXJzL3F1YWRyYW1tYS9naXQvcWphcnZpcy5jbGllbnQvc3JjL2pzL2NvbnRyb2xzL19tb2R1bGVfaW5pdC5qcyIsIkM6L1VzZXJzL3F1YWRyYW1tYS9naXQvcWphcnZpcy5jbGllbnQvc3JjL2pzL2NvbnRyb2xzL3FqY29tYm9ib3hDdHJsLmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvY29udHJvbHMvcWpmaWx0ZXJDdHJsLmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvY29udHJvbHMvcWpsaXN0dmlld0N0cmwuanMiLCJDOi9Vc2Vycy9xdWFkcmFtbWEvZ2l0L3FqYXJ2aXMuY2xpZW50L3NyYy9qcy9jb250cm9scy9xanNlbGVjdGtleUN0cmwuanMiLCJDOi9Vc2Vycy9xdWFkcmFtbWEvZ2l0L3FqYXJ2aXMuY2xpZW50L3NyYy9qcy9jb250cm9scy9xanRpbWVyY291bnRlckN0cmwuanMiLCJDOi9Vc2Vycy9xdWFkcmFtbWEvZ2l0L3FqYXJ2aXMuY2xpZW50L3NyYy9qcy9kaXJlY3RpdmVzL19tb2R1bGVfaW5pdC5qcyIsIkM6L1VzZXJzL3F1YWRyYW1tYS9naXQvcWphcnZpcy5jbGllbnQvc3JjL2pzL2RpcmVjdGl2ZXMvbmdlbnRlckRpcmVjdGl2ZS5qcyIsIkM6L1VzZXJzL3F1YWRyYW1tYS9naXQvcWphcnZpcy5jbGllbnQvc3JjL2pzL2RpcmVjdGl2ZXMvcWphcGlpbmZvRGlyZWN0aXZlLmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvZGlyZWN0aXZlcy9xamJyZWFkY3J1bWJEaXJlY3RpdmUuanMiLCJDOi9Vc2Vycy9xdWFkcmFtbWEvZ2l0L3FqYXJ2aXMuY2xpZW50L3NyYy9qcy9tYWluL0FkbWluTFRFL2FwcC5qcyIsIkM6L1VzZXJzL3F1YWRyYW1tYS9naXQvcWphcnZpcy5jbGllbnQvc3JjL2pzL21haW4vQWRtaW5MVEUvZGFzaGJvYXJkLmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvbWFpbi9BZG1pbkxURS9kZW1vLmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvbWFpbi9mYWtlXzNkZjRmMTNlLmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvc2VydmljZXMvX21vZHVsZV9pbml0LmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvc2VydmljZXMvYXBpU2VydmljZS5qcyIsIkM6L1VzZXJzL3F1YWRyYW1tYS9naXQvcWphcnZpcy5jbGllbnQvc3JjL2pzL3NlcnZpY2VzL2F1dGhTZXJ2aWNlLmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvc2VydmljZXMvY29uZmlnU2VydmljZS5qcyIsIkM6L1VzZXJzL3F1YWRyYW1tYS9naXQvcWphcnZpcy5jbGllbnQvc3JjL2pzL3NlcnZpY2VzL2Vycm9ySGFuZGxlclNlcnZpY2UuanMiLCJDOi9Vc2Vycy9xdWFkcmFtbWEvZ2l0L3FqYXJ2aXMuY2xpZW50L3NyYy9qcy9zZXJ2aWNlcy9oZWxwZXJTZXJ2aWNlLmpzIiwiQzovVXNlcnMvcXVhZHJhbW1hL2dpdC9xamFydmlzLmNsaWVudC9zcmMvanMvc2VydmljZXMvbG9jYWxTZXNzaW9uU2VydmljZS5qcyIsIkM6L1VzZXJzL3F1YWRyYW1tYS9naXQvcWphcnZpcy5jbGllbnQvc3JjL2pzL3NlcnZpY2VzL2xvZ2dlclNlcnZpY2UuanMiLCJDOi9Vc2Vycy9xdWFkcmFtbWEvZ2l0L3FqYXJ2aXMuY2xpZW50L3NyYy9qcy9zZXJ2aWNlcy9sb2dpblNlcnZpY2UuanMiLCJDOi9Vc2Vycy9xdWFkcmFtbWEvZ2l0L3FqYXJ2aXMuY2xpZW50L3NyYy9qcy9zZXJ2aWNlcy90aW1lU2VydmljZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdmxDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNjQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5UUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BpQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vKiFcbiAqIFRoZSBidWZmZXIgbW9kdWxlIGZyb20gbm9kZS5qcywgZm9yIHRoZSBicm93c2VyLlxuICpcbiAqIEBhdXRob3IgICBGZXJvc3MgQWJvdWtoYWRpamVoIDxmZXJvc3NAZmVyb3NzLm9yZz4gPGh0dHA6Ly9mZXJvc3Mub3JnPlxuICogQGxpY2Vuc2UgIE1JVFxuICovXG5cbnZhciBiYXNlNjQgPSByZXF1aXJlKCdiYXNlNjQtanMnKVxudmFyIGllZWU3NTQgPSByZXF1aXJlKCdpZWVlNzU0JylcblxuZXhwb3J0cy5CdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuU2xvd0J1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUyA9IDUwXG5CdWZmZXIucG9vbFNpemUgPSA4MTkyXG5cbi8qKlxuICogSWYgYEJ1ZmZlci5fdXNlVHlwZWRBcnJheXNgOlxuICogICA9PT0gdHJ1ZSAgICBVc2UgVWludDhBcnJheSBpbXBsZW1lbnRhdGlvbiAoZmFzdGVzdClcbiAqICAgPT09IGZhbHNlICAgVXNlIE9iamVjdCBpbXBsZW1lbnRhdGlvbiAoY29tcGF0aWJsZSBkb3duIHRvIElFNilcbiAqL1xuQnVmZmVyLl91c2VUeXBlZEFycmF5cyA9IChmdW5jdGlvbiAoKSB7XG4gIC8vIERldGVjdCBpZiBicm93c2VyIHN1cHBvcnRzIFR5cGVkIEFycmF5cy4gU3VwcG9ydGVkIGJyb3dzZXJzIGFyZSBJRSAxMCssIEZpcmVmb3ggNCssXG4gIC8vIENocm9tZSA3KywgU2FmYXJpIDUuMSssIE9wZXJhIDExLjYrLCBpT1MgNC4yKy4gSWYgdGhlIGJyb3dzZXIgZG9lcyBub3Qgc3VwcG9ydCBhZGRpbmdcbiAgLy8gcHJvcGVydGllcyB0byBgVWludDhBcnJheWAgaW5zdGFuY2VzLCB0aGVuIHRoYXQncyB0aGUgc2FtZSBhcyBubyBgVWludDhBcnJheWAgc3VwcG9ydFxuICAvLyBiZWNhdXNlIHdlIG5lZWQgdG8gYmUgYWJsZSB0byBhZGQgYWxsIHRoZSBub2RlIEJ1ZmZlciBBUEkgbWV0aG9kcy4gVGhpcyBpcyBhbiBpc3N1ZVxuICAvLyBpbiBGaXJlZm94IDQtMjkuIE5vdyBmaXhlZDogaHR0cHM6Ly9idWd6aWxsYS5tb3ppbGxhLm9yZy9zaG93X2J1Zy5jZ2k/aWQ9Njk1NDM4XG4gIHRyeSB7XG4gICAgdmFyIGJ1ZiA9IG5ldyBBcnJheUJ1ZmZlcigwKVxuICAgIHZhciBhcnIgPSBuZXcgVWludDhBcnJheShidWYpXG4gICAgYXJyLmZvbyA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIDQyIH1cbiAgICByZXR1cm4gNDIgPT09IGFyci5mb28oKSAmJlxuICAgICAgICB0eXBlb2YgYXJyLnN1YmFycmF5ID09PSAnZnVuY3Rpb24nIC8vIENocm9tZSA5LTEwIGxhY2sgYHN1YmFycmF5YFxuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbn0pKClcblxuLyoqXG4gKiBDbGFzczogQnVmZmVyXG4gKiA9PT09PT09PT09PT09XG4gKlxuICogVGhlIEJ1ZmZlciBjb25zdHJ1Y3RvciByZXR1cm5zIGluc3RhbmNlcyBvZiBgVWludDhBcnJheWAgdGhhdCBhcmUgYXVnbWVudGVkXG4gKiB3aXRoIGZ1bmN0aW9uIHByb3BlcnRpZXMgZm9yIGFsbCB0aGUgbm9kZSBgQnVmZmVyYCBBUEkgZnVuY3Rpb25zLiBXZSB1c2VcbiAqIGBVaW50OEFycmF5YCBzbyB0aGF0IHNxdWFyZSBicmFja2V0IG5vdGF0aW9uIHdvcmtzIGFzIGV4cGVjdGVkIC0tIGl0IHJldHVybnNcbiAqIGEgc2luZ2xlIG9jdGV0LlxuICpcbiAqIEJ5IGF1Z21lbnRpbmcgdGhlIGluc3RhbmNlcywgd2UgY2FuIGF2b2lkIG1vZGlmeWluZyB0aGUgYFVpbnQ4QXJyYXlgXG4gKiBwcm90b3R5cGUuXG4gKi9cbmZ1bmN0aW9uIEJ1ZmZlciAoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgQnVmZmVyKSlcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcihzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKVxuXG4gIHZhciB0eXBlID0gdHlwZW9mIHN1YmplY3RcblxuICAvLyBXb3JrYXJvdW5kOiBub2RlJ3MgYmFzZTY0IGltcGxlbWVudGF0aW9uIGFsbG93cyBmb3Igbm9uLXBhZGRlZCBzdHJpbmdzXG4gIC8vIHdoaWxlIGJhc2U2NC1qcyBkb2VzIG5vdC5cbiAgaWYgKGVuY29kaW5nID09PSAnYmFzZTY0JyAmJiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgIHN1YmplY3QgPSBzdHJpbmd0cmltKHN1YmplY3QpXG4gICAgd2hpbGUgKHN1YmplY3QubGVuZ3RoICUgNCAhPT0gMCkge1xuICAgICAgc3ViamVjdCA9IHN1YmplY3QgKyAnPSdcbiAgICB9XG4gIH1cblxuICAvLyBGaW5kIHRoZSBsZW5ndGhcbiAgdmFyIGxlbmd0aFxuICBpZiAodHlwZSA9PT0gJ251bWJlcicpXG4gICAgbGVuZ3RoID0gY29lcmNlKHN1YmplY3QpXG4gIGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKVxuICAgIGxlbmd0aCA9IEJ1ZmZlci5ieXRlTGVuZ3RoKHN1YmplY3QsIGVuY29kaW5nKVxuICBlbHNlIGlmICh0eXBlID09PSAnb2JqZWN0JylcbiAgICBsZW5ndGggPSBjb2VyY2Uoc3ViamVjdC5sZW5ndGgpIC8vIGFzc3VtZSB0aGF0IG9iamVjdCBpcyBhcnJheS1saWtlXG4gIGVsc2VcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpcnN0IGFyZ3VtZW50IG5lZWRzIHRvIGJlIGEgbnVtYmVyLCBhcnJheSBvciBzdHJpbmcuJylcblxuICB2YXIgYnVmXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgLy8gUHJlZmVycmVkOiBSZXR1cm4gYW4gYXVnbWVudGVkIGBVaW50OEFycmF5YCBpbnN0YW5jZSBmb3IgYmVzdCBwZXJmb3JtYW5jZVxuICAgIGJ1ZiA9IEJ1ZmZlci5fYXVnbWVudChuZXcgVWludDhBcnJheShsZW5ndGgpKVxuICB9IGVsc2Uge1xuICAgIC8vIEZhbGxiYWNrOiBSZXR1cm4gVEhJUyBpbnN0YW5jZSBvZiBCdWZmZXIgKGNyZWF0ZWQgYnkgYG5ld2ApXG4gICAgYnVmID0gdGhpc1xuICAgIGJ1Zi5sZW5ndGggPSBsZW5ndGhcbiAgICBidWYuX2lzQnVmZmVyID0gdHJ1ZVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgJiYgdHlwZW9mIHN1YmplY3QuYnl0ZUxlbmd0aCA9PT0gJ251bWJlcicpIHtcbiAgICAvLyBTcGVlZCBvcHRpbWl6YXRpb24gLS0gdXNlIHNldCBpZiB3ZSdyZSBjb3B5aW5nIGZyb20gYSB0eXBlZCBhcnJheVxuICAgIGJ1Zi5fc2V0KHN1YmplY3QpXG4gIH0gZWxzZSBpZiAoaXNBcnJheWlzaChzdWJqZWN0KSkge1xuICAgIC8vIFRyZWF0IGFycmF5LWlzaCBvYmplY3RzIGFzIGEgYnl0ZSBhcnJheVxuICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSlcbiAgICAgICAgYnVmW2ldID0gc3ViamVjdC5yZWFkVUludDgoaSlcbiAgICAgIGVsc2VcbiAgICAgICAgYnVmW2ldID0gc3ViamVjdFtpXVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJykge1xuICAgIGJ1Zi53cml0ZShzdWJqZWN0LCAwLCBlbmNvZGluZylcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJyAmJiAhQnVmZmVyLl91c2VUeXBlZEFycmF5cyAmJiAhbm9aZXJvKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBidWZbaV0gPSAwXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ1ZlxufVxuXG4vLyBTVEFUSUMgTUVUSE9EU1xuLy8gPT09PT09PT09PT09PT1cblxuQnVmZmVyLmlzRW5jb2RpbmcgPSBmdW5jdGlvbiAoZW5jb2RpbmcpIHtcbiAgc3dpdGNoIChTdHJpbmcoZW5jb2RpbmcpLnRvTG93ZXJDYXNlKCkpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldHVybiB0cnVlXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbkJ1ZmZlci5pc0J1ZmZlciA9IGZ1bmN0aW9uIChiKSB7XG4gIHJldHVybiAhIShiICE9PSBudWxsICYmIGIgIT09IHVuZGVmaW5lZCAmJiBiLl9pc0J1ZmZlcilcbn1cblxuQnVmZmVyLmJ5dGVMZW5ndGggPSBmdW5jdGlvbiAoc3RyLCBlbmNvZGluZykge1xuICB2YXIgcmV0XG4gIHN0ciA9IHN0ciArICcnXG4gIHN3aXRjaCAoZW5jb2RpbmcgfHwgJ3V0ZjgnKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGggLyAyXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IHV0ZjhUb0J5dGVzKHN0cikubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBiYXNlNjRUb0J5dGVzKHN0cikubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoICogMlxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbkJ1ZmZlci5jb25jYXQgPSBmdW5jdGlvbiAobGlzdCwgdG90YWxMZW5ndGgpIHtcbiAgYXNzZXJ0KGlzQXJyYXkobGlzdCksICdVc2FnZTogQnVmZmVyLmNvbmNhdChsaXN0LCBbdG90YWxMZW5ndGhdKVxcbicgK1xuICAgICAgJ2xpc3Qgc2hvdWxkIGJlIGFuIEFycmF5LicpXG5cbiAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoMClcbiAgfSBlbHNlIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBsaXN0WzBdXG4gIH1cblxuICB2YXIgaVxuICBpZiAodHlwZW9mIHRvdGFsTGVuZ3RoICE9PSAnbnVtYmVyJykge1xuICAgIHRvdGFsTGVuZ3RoID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICB0b3RhbExlbmd0aCArPSBsaXN0W2ldLmxlbmd0aFxuICAgIH1cbiAgfVxuXG4gIHZhciBidWYgPSBuZXcgQnVmZmVyKHRvdGFsTGVuZ3RoKVxuICB2YXIgcG9zID0gMFxuICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgIHZhciBpdGVtID0gbGlzdFtpXVxuICAgIGl0ZW0uY29weShidWYsIHBvcylcbiAgICBwb3MgKz0gaXRlbS5sZW5ndGhcbiAgfVxuICByZXR1cm4gYnVmXG59XG5cbi8vIEJVRkZFUiBJTlNUQU5DRSBNRVRIT0RTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBfaGV4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSBidWYubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cblxuICAvLyBtdXN0IGJlIGFuIGV2ZW4gbnVtYmVyIG9mIGRpZ2l0c1xuICB2YXIgc3RyTGVuID0gc3RyaW5nLmxlbmd0aFxuICBhc3NlcnQoc3RyTGVuICUgMiA9PT0gMCwgJ0ludmFsaWQgaGV4IHN0cmluZycpXG5cbiAgaWYgKGxlbmd0aCA+IHN0ckxlbiAvIDIpIHtcbiAgICBsZW5ndGggPSBzdHJMZW4gLyAyXG4gIH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIHZhciBieXRlID0gcGFyc2VJbnQoc3RyaW5nLnN1YnN0cihpICogMiwgMiksIDE2KVxuICAgIGFzc2VydCghaXNOYU4oYnl0ZSksICdJbnZhbGlkIGhleCBzdHJpbmcnKVxuICAgIGJ1ZltvZmZzZXQgKyBpXSA9IGJ5dGVcbiAgfVxuICBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9IGkgKiAyXG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIF91dGY4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIodXRmOFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfYXNjaWlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcihhc2NpaVRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfYmluYXJ5V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gX2FzY2lpV3JpdGUoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiBfYmFzZTY0V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIoYmFzZTY0VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF91dGYxNmxlV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIodXRmMTZsZVRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24gKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKSB7XG4gIC8vIFN1cHBvcnQgYm90aCAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpXG4gIC8vIGFuZCB0aGUgbGVnYWN5IChzdHJpbmcsIGVuY29kaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgaWYgKGlzRmluaXRlKG9mZnNldCkpIHtcbiAgICBpZiAoIWlzRmluaXRlKGxlbmd0aCkpIHtcbiAgICAgIGVuY29kaW5nID0gbGVuZ3RoXG4gICAgICBsZW5ndGggPSB1bmRlZmluZWRcbiAgICB9XG4gIH0gZWxzZSB7ICAvLyBsZWdhY3lcbiAgICB2YXIgc3dhcCA9IGVuY29kaW5nXG4gICAgZW5jb2RpbmcgPSBvZmZzZXRcbiAgICBvZmZzZXQgPSBsZW5ndGhcbiAgICBsZW5ndGggPSBzd2FwXG4gIH1cblxuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSB0aGlzLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG4gIGVuY29kaW5nID0gU3RyaW5nKGVuY29kaW5nIHx8ICd1dGY4JykudG9Mb3dlckNhc2UoKVxuXG4gIHZhciByZXRcbiAgc3dpdGNoIChlbmNvZGluZykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBfaGV4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gX3V0ZjhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXQgPSBfYXNjaWlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiaW5hcnknOlxuICAgICAgcmV0ID0gX2JpbmFyeVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBfYmFzZTY0V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IF91dGYxNmxlV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nLCBzdGFydCwgZW5kKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuXG4gIGVuY29kaW5nID0gU3RyaW5nKGVuY29kaW5nIHx8ICd1dGY4JykudG9Mb3dlckNhc2UoKVxuICBzdGFydCA9IE51bWJlcihzdGFydCkgfHwgMFxuICBlbmQgPSAoZW5kICE9PSB1bmRlZmluZWQpXG4gICAgPyBOdW1iZXIoZW5kKVxuICAgIDogZW5kID0gc2VsZi5sZW5ndGhcblxuICAvLyBGYXN0cGF0aCBlbXB0eSBzdHJpbmdzXG4gIGlmIChlbmQgPT09IHN0YXJ0KVxuICAgIHJldHVybiAnJ1xuXG4gIHZhciByZXRcbiAgc3dpdGNoIChlbmNvZGluZykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBfaGV4U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gX3V0ZjhTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXQgPSBfYXNjaWlTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiaW5hcnknOlxuICAgICAgcmV0ID0gX2JpbmFyeVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBfYmFzZTY0U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IF91dGYxNmxlU2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiAnQnVmZmVyJyxcbiAgICBkYXRhOiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLl9hcnIgfHwgdGhpcywgMClcbiAgfVxufVxuXG4vLyBjb3B5KHRhcmdldEJ1ZmZlciwgdGFyZ2V0U3RhcnQ9MCwgc291cmNlU3RhcnQ9MCwgc291cmNlRW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmNvcHkgPSBmdW5jdGlvbiAodGFyZ2V0LCB0YXJnZXRfc3RhcnQsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNvdXJjZSA9IHRoaXNcblxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgJiYgZW5kICE9PSAwKSBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAoIXRhcmdldF9zdGFydCkgdGFyZ2V0X3N0YXJ0ID0gMFxuXG4gIC8vIENvcHkgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0YXJnZXQubGVuZ3RoID09PSAwIHx8IHNvdXJjZS5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIC8vIEZhdGFsIGVycm9yIGNvbmRpdGlvbnNcbiAgYXNzZXJ0KGVuZCA+PSBzdGFydCwgJ3NvdXJjZUVuZCA8IHNvdXJjZVN0YXJ0JylcbiAgYXNzZXJ0KHRhcmdldF9zdGFydCA+PSAwICYmIHRhcmdldF9zdGFydCA8IHRhcmdldC5sZW5ndGgsXG4gICAgICAndGFyZ2V0U3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChzdGFydCA+PSAwICYmIHN0YXJ0IDwgc291cmNlLmxlbmd0aCwgJ3NvdXJjZVN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoZW5kID49IDAgJiYgZW5kIDw9IHNvdXJjZS5sZW5ndGgsICdzb3VyY2VFbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgLy8gQXJlIHdlIG9vYj9cbiAgaWYgKGVuZCA+IHRoaXMubGVuZ3RoKVxuICAgIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICh0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0IDwgZW5kIC0gc3RhcnQpXG4gICAgZW5kID0gdGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCArIHN0YXJ0XG5cbiAgdmFyIGxlbiA9IGVuZCAtIHN0YXJ0XG5cbiAgaWYgKGxlbiA8IDEwMCB8fCAhQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspXG4gICAgICB0YXJnZXRbaSArIHRhcmdldF9zdGFydF0gPSB0aGlzW2kgKyBzdGFydF1cbiAgfSBlbHNlIHtcbiAgICB0YXJnZXQuX3NldCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBzdGFydCArIGxlbiksIHRhcmdldF9zdGFydClcbiAgfVxufVxuXG5mdW5jdGlvbiBfYmFzZTY0U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICBpZiAoc3RhcnQgPT09IDAgJiYgZW5kID09PSBidWYubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1ZilcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmLnNsaWNlKHN0YXJ0LCBlbmQpKVxuICB9XG59XG5cbmZ1bmN0aW9uIF91dGY4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmVzID0gJydcbiAgdmFyIHRtcCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIGlmIChidWZbaV0gPD0gMHg3Rikge1xuICAgICAgcmVzICs9IGRlY29kZVV0ZjhDaGFyKHRtcCkgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgICAgIHRtcCA9ICcnXG4gICAgfSBlbHNlIHtcbiAgICAgIHRtcCArPSAnJScgKyBidWZbaV0udG9TdHJpbmcoMTYpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJlcyArIGRlY29kZVV0ZjhDaGFyKHRtcClcbn1cblxuZnVuY3Rpb24gX2FzY2lpU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKVxuICAgIHJldCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgcmV0dXJuIHJldFxufVxuXG5mdW5jdGlvbiBfYmluYXJ5U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICByZXR1cm4gX2FzY2lpU2xpY2UoYnVmLCBzdGFydCwgZW5kKVxufVxuXG5mdW5jdGlvbiBfaGV4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuXG4gIGlmICghc3RhcnQgfHwgc3RhcnQgPCAwKSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgfHwgZW5kIDwgMCB8fCBlbmQgPiBsZW4pIGVuZCA9IGxlblxuXG4gIHZhciBvdXQgPSAnJ1xuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIG91dCArPSB0b0hleChidWZbaV0pXG4gIH1cbiAgcmV0dXJuIG91dFxufVxuXG5mdW5jdGlvbiBfdXRmMTZsZVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGJ5dGVzID0gYnVmLnNsaWNlKHN0YXJ0LCBlbmQpXG4gIHZhciByZXMgPSAnJ1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgcmVzICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZXNbaV0gKyBieXRlc1tpKzFdICogMjU2KVxuICB9XG4gIHJldHVybiByZXNcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5zbGljZSA9IGZ1bmN0aW9uIChzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBzdGFydCA9IGNsYW1wKHN0YXJ0LCBsZW4sIDApXG4gIGVuZCA9IGNsYW1wKGVuZCwgbGVuLCBsZW4pXG5cbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICByZXR1cm4gQnVmZmVyLl9hdWdtZW50KHRoaXMuc3ViYXJyYXkoc3RhcnQsIGVuZCkpXG4gIH0gZWxzZSB7XG4gICAgdmFyIHNsaWNlTGVuID0gZW5kIC0gc3RhcnRcbiAgICB2YXIgbmV3QnVmID0gbmV3IEJ1ZmZlcihzbGljZUxlbiwgdW5kZWZpbmVkLCB0cnVlKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2xpY2VMZW47IGkrKykge1xuICAgICAgbmV3QnVmW2ldID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICAgIHJldHVybiBuZXdCdWZcbiAgfVxufVxuXG4vLyBgZ2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAob2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuZ2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy5yZWFkVUludDgob2Zmc2V0KVxufVxuXG4vLyBgc2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAodiwgb2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuc2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy53cml0ZVVJbnQ4KHYsIG9mZnNldClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIHJldHVybiB0aGlzW29mZnNldF1cbn1cblxuZnVuY3Rpb24gX3JlYWRVSW50MTYgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsXG4gIGlmIChsaXR0bGVFbmRpYW4pIHtcbiAgICB2YWwgPSBidWZbb2Zmc2V0XVxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXSA8PCA4XG4gIH0gZWxzZSB7XG4gICAgdmFsID0gYnVmW29mZnNldF0gPDwgOFxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXVxuICB9XG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MTYodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MTYodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkVUludDMyIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbFxuICBpZiAobGl0dGxlRW5kaWFuKSB7XG4gICAgaWYgKG9mZnNldCArIDIgPCBsZW4pXG4gICAgICB2YWwgPSBidWZbb2Zmc2V0ICsgMl0gPDwgMTZcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV0gPDwgOFxuICAgIHZhbCB8PSBidWZbb2Zmc2V0XVxuICAgIGlmIChvZmZzZXQgKyAzIDwgbGVuKVxuICAgICAgdmFsID0gdmFsICsgKGJ1ZltvZmZzZXQgKyAzXSA8PCAyNCA+Pj4gMClcbiAgfSBlbHNlIHtcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCA9IGJ1ZltvZmZzZXQgKyAxXSA8PCAxNlxuICAgIGlmIChvZmZzZXQgKyAyIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAyXSA8PCA4XG4gICAgaWYgKG9mZnNldCArIDMgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDNdXG4gICAgdmFsID0gdmFsICsgKGJ1ZltvZmZzZXRdIDw8IDI0ID4+PiAwKVxuICB9XG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MzIodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MzIodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCxcbiAgICAgICAgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIHZhciBuZWcgPSB0aGlzW29mZnNldF0gJiAweDgwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmIC0gdGhpc1tvZmZzZXRdICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5mdW5jdGlvbiBfcmVhZEludDE2IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbCA9IF9yZWFkVUludDE2KGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpXG4gIHZhciBuZWcgPSB2YWwgJiAweDgwMDBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmZmZiAtIHZhbCArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDE2KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQxNih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRJbnQzMiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWwgPSBfcmVhZFVJbnQzMihidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKVxuICB2YXIgbmVnID0gdmFsICYgMHg4MDAwMDAwMFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZmZmZmZmZiAtIHZhbCArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDMyKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQzMih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRGbG9hdCAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICByZXR1cm4gaWVlZTc1NC5yZWFkKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdExFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRmxvYXQodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEZsb2F0KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZERvdWJsZSAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICsgNyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICByZXR1cm4gaWVlZTc1NC5yZWFkKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZERvdWJsZSh0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZERvdWJsZSh0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmYpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKSByZXR1cm5cblxuICB0aGlzW29mZnNldF0gPSB2YWx1ZVxufVxuXG5mdW5jdGlvbiBfd3JpdGVVSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZmZmKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihsZW4gLSBvZmZzZXQsIDIpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID1cbiAgICAgICAgKHZhbHVlICYgKDB4ZmYgPDwgKDggKiAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSkpKSA+Pj5cbiAgICAgICAgICAgIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpICogOFxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVVSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZmZmZmZmZilcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4obGVuIC0gb2Zmc2V0LCA0KTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9XG4gICAgICAgICh2YWx1ZSA+Pj4gKGxpdHRsZUVuZGlhbiA/IGkgOiAzIC0gaSkgKiA4KSAmIDB4ZmZcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZiwgLTB4ODApXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIHRoaXMud3JpdGVVSW50OCh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydClcbiAgZWxzZVxuICAgIHRoaXMud3JpdGVVSW50OCgweGZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmZmYsIC0weDgwMDApXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICBfd3JpdGVVSW50MTYoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgX3dyaXRlVUludDE2KGJ1ZiwgMHhmZmZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2ZmZmZmZmYsIC0weDgwMDAwMDAwKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgX3dyaXRlVUludDMyKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbiAgZWxzZVxuICAgIF93cml0ZVVJbnQzMihidWYsIDB4ZmZmZmZmZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlRmxvYXQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmSUVFRTc1NCh2YWx1ZSwgMy40MDI4MjM0NjYzODUyODg2ZSszOCwgLTMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdEJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlRG91YmxlIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDcgPCBidWYubGVuZ3RoLFxuICAgICAgICAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZklFRUU3NTQodmFsdWUsIDEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4LCAtMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbi8vIGZpbGwodmFsdWUsIHN0YXJ0PTAsIGVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5maWxsID0gZnVuY3Rpb24gKHZhbHVlLCBzdGFydCwgZW5kKSB7XG4gIGlmICghdmFsdWUpIHZhbHVlID0gMFxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQpIGVuZCA9IHRoaXMubGVuZ3RoXG5cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICB2YWx1ZSA9IHZhbHVlLmNoYXJDb2RlQXQoMClcbiAgfVxuXG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmICFpc05hTih2YWx1ZSksICd2YWx1ZSBpcyBub3QgYSBudW1iZXInKVxuICBhc3NlcnQoZW5kID49IHN0YXJ0LCAnZW5kIDwgc3RhcnQnKVxuXG4gIC8vIEZpbGwgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgYXNzZXJ0KHN0YXJ0ID49IDAgJiYgc3RhcnQgPCB0aGlzLmxlbmd0aCwgJ3N0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoZW5kID49IDAgJiYgZW5kIDw9IHRoaXMubGVuZ3RoLCAnZW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgdGhpc1tpXSA9IHZhbHVlXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgb3V0ID0gW11cbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICBvdXRbaV0gPSB0b0hleCh0aGlzW2ldKVxuICAgIGlmIChpID09PSBleHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTKSB7XG4gICAgICBvdXRbaSArIDFdID0gJy4uLidcbiAgICAgIGJyZWFrXG4gICAgfVxuICB9XG4gIHJldHVybiAnPEJ1ZmZlciAnICsgb3V0LmpvaW4oJyAnKSArICc+J1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgYEFycmF5QnVmZmVyYCB3aXRoIHRoZSAqY29waWVkKiBtZW1vcnkgb2YgdGhlIGJ1ZmZlciBpbnN0YW5jZS5cbiAqIEFkZGVkIGluIE5vZGUgMC4xMi4gT25seSBhdmFpbGFibGUgaW4gYnJvd3NlcnMgdGhhdCBzdXBwb3J0IEFycmF5QnVmZmVyLlxuICovXG5CdWZmZXIucHJvdG90eXBlLnRvQXJyYXlCdWZmZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgICAgcmV0dXJuIChuZXcgQnVmZmVyKHRoaXMpKS5idWZmZXJcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGJ1ZiA9IG5ldyBVaW50OEFycmF5KHRoaXMubGVuZ3RoKVxuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGJ1Zi5sZW5ndGg7IGkgPCBsZW47IGkgKz0gMSlcbiAgICAgICAgYnVmW2ldID0gdGhpc1tpXVxuICAgICAgcmV0dXJuIGJ1Zi5idWZmZXJcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdCdWZmZXIudG9BcnJheUJ1ZmZlciBub3Qgc3VwcG9ydGVkIGluIHRoaXMgYnJvd3NlcicpXG4gIH1cbn1cblxuLy8gSEVMUEVSIEZVTkNUSU9OU1xuLy8gPT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBzdHJpbmd0cmltIChzdHIpIHtcbiAgaWYgKHN0ci50cmltKSByZXR1cm4gc3RyLnRyaW0oKVxuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKVxufVxuXG52YXIgQlAgPSBCdWZmZXIucHJvdG90eXBlXG5cbi8qKlxuICogQXVnbWVudCBhIFVpbnQ4QXJyYXkgKmluc3RhbmNlKiAobm90IHRoZSBVaW50OEFycmF5IGNsYXNzISkgd2l0aCBCdWZmZXIgbWV0aG9kc1xuICovXG5CdWZmZXIuX2F1Z21lbnQgPSBmdW5jdGlvbiAoYXJyKSB7XG4gIGFyci5faXNCdWZmZXIgPSB0cnVlXG5cbiAgLy8gc2F2ZSByZWZlcmVuY2UgdG8gb3JpZ2luYWwgVWludDhBcnJheSBnZXQvc2V0IG1ldGhvZHMgYmVmb3JlIG92ZXJ3cml0aW5nXG4gIGFyci5fZ2V0ID0gYXJyLmdldFxuICBhcnIuX3NldCA9IGFyci5zZXRcblxuICAvLyBkZXByZWNhdGVkLCB3aWxsIGJlIHJlbW92ZWQgaW4gbm9kZSAwLjEzK1xuICBhcnIuZ2V0ID0gQlAuZ2V0XG4gIGFyci5zZXQgPSBCUC5zZXRcblxuICBhcnIud3JpdGUgPSBCUC53cml0ZVxuICBhcnIudG9TdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9Mb2NhbGVTdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9KU09OID0gQlAudG9KU09OXG4gIGFyci5jb3B5ID0gQlAuY29weVxuICBhcnIuc2xpY2UgPSBCUC5zbGljZVxuICBhcnIucmVhZFVJbnQ4ID0gQlAucmVhZFVJbnQ4XG4gIGFyci5yZWFkVUludDE2TEUgPSBCUC5yZWFkVUludDE2TEVcbiAgYXJyLnJlYWRVSW50MTZCRSA9IEJQLnJlYWRVSW50MTZCRVxuICBhcnIucmVhZFVJbnQzMkxFID0gQlAucmVhZFVJbnQzMkxFXG4gIGFyci5yZWFkVUludDMyQkUgPSBCUC5yZWFkVUludDMyQkVcbiAgYXJyLnJlYWRJbnQ4ID0gQlAucmVhZEludDhcbiAgYXJyLnJlYWRJbnQxNkxFID0gQlAucmVhZEludDE2TEVcbiAgYXJyLnJlYWRJbnQxNkJFID0gQlAucmVhZEludDE2QkVcbiAgYXJyLnJlYWRJbnQzMkxFID0gQlAucmVhZEludDMyTEVcbiAgYXJyLnJlYWRJbnQzMkJFID0gQlAucmVhZEludDMyQkVcbiAgYXJyLnJlYWRGbG9hdExFID0gQlAucmVhZEZsb2F0TEVcbiAgYXJyLnJlYWRGbG9hdEJFID0gQlAucmVhZEZsb2F0QkVcbiAgYXJyLnJlYWREb3VibGVMRSA9IEJQLnJlYWREb3VibGVMRVxuICBhcnIucmVhZERvdWJsZUJFID0gQlAucmVhZERvdWJsZUJFXG4gIGFyci53cml0ZVVJbnQ4ID0gQlAud3JpdGVVSW50OFxuICBhcnIud3JpdGVVSW50MTZMRSA9IEJQLndyaXRlVUludDE2TEVcbiAgYXJyLndyaXRlVUludDE2QkUgPSBCUC53cml0ZVVJbnQxNkJFXG4gIGFyci53cml0ZVVJbnQzMkxFID0gQlAud3JpdGVVSW50MzJMRVxuICBhcnIud3JpdGVVSW50MzJCRSA9IEJQLndyaXRlVUludDMyQkVcbiAgYXJyLndyaXRlSW50OCA9IEJQLndyaXRlSW50OFxuICBhcnIud3JpdGVJbnQxNkxFID0gQlAud3JpdGVJbnQxNkxFXG4gIGFyci53cml0ZUludDE2QkUgPSBCUC53cml0ZUludDE2QkVcbiAgYXJyLndyaXRlSW50MzJMRSA9IEJQLndyaXRlSW50MzJMRVxuICBhcnIud3JpdGVJbnQzMkJFID0gQlAud3JpdGVJbnQzMkJFXG4gIGFyci53cml0ZUZsb2F0TEUgPSBCUC53cml0ZUZsb2F0TEVcbiAgYXJyLndyaXRlRmxvYXRCRSA9IEJQLndyaXRlRmxvYXRCRVxuICBhcnIud3JpdGVEb3VibGVMRSA9IEJQLndyaXRlRG91YmxlTEVcbiAgYXJyLndyaXRlRG91YmxlQkUgPSBCUC53cml0ZURvdWJsZUJFXG4gIGFyci5maWxsID0gQlAuZmlsbFxuICBhcnIuaW5zcGVjdCA9IEJQLmluc3BlY3RcbiAgYXJyLnRvQXJyYXlCdWZmZXIgPSBCUC50b0FycmF5QnVmZmVyXG5cbiAgcmV0dXJuIGFyclxufVxuXG4vLyBzbGljZShzdGFydCwgZW5kKVxuZnVuY3Rpb24gY2xhbXAgKGluZGV4LCBsZW4sIGRlZmF1bHRWYWx1ZSkge1xuICBpZiAodHlwZW9mIGluZGV4ICE9PSAnbnVtYmVyJykgcmV0dXJuIGRlZmF1bHRWYWx1ZVxuICBpbmRleCA9IH5+aW5kZXg7ICAvLyBDb2VyY2UgdG8gaW50ZWdlci5cbiAgaWYgKGluZGV4ID49IGxlbikgcmV0dXJuIGxlblxuICBpZiAoaW5kZXggPj0gMCkgcmV0dXJuIGluZGV4XG4gIGluZGV4ICs9IGxlblxuICBpZiAoaW5kZXggPj0gMCkgcmV0dXJuIGluZGV4XG4gIHJldHVybiAwXG59XG5cbmZ1bmN0aW9uIGNvZXJjZSAobGVuZ3RoKSB7XG4gIC8vIENvZXJjZSBsZW5ndGggdG8gYSBudW1iZXIgKHBvc3NpYmx5IE5hTiksIHJvdW5kIHVwXG4gIC8vIGluIGNhc2UgaXQncyBmcmFjdGlvbmFsIChlLmcuIDEyMy40NTYpIHRoZW4gZG8gYVxuICAvLyBkb3VibGUgbmVnYXRlIHRvIGNvZXJjZSBhIE5hTiB0byAwLiBFYXN5LCByaWdodD9cbiAgbGVuZ3RoID0gfn5NYXRoLmNlaWwoK2xlbmd0aClcbiAgcmV0dXJuIGxlbmd0aCA8IDAgPyAwIDogbGVuZ3RoXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXkgKHN1YmplY3QpIHtcbiAgcmV0dXJuIChBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uIChzdWJqZWN0KSB7XG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzdWJqZWN0KSA9PT0gJ1tvYmplY3QgQXJyYXldJ1xuICB9KShzdWJqZWN0KVxufVxuXG5mdW5jdGlvbiBpc0FycmF5aXNoIChzdWJqZWN0KSB7XG4gIHJldHVybiBpc0FycmF5KHN1YmplY3QpIHx8IEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSB8fFxuICAgICAgc3ViamVjdCAmJiB0eXBlb2Ygc3ViamVjdCA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHR5cGVvZiBzdWJqZWN0Lmxlbmd0aCA9PT0gJ251bWJlcidcbn1cblxuZnVuY3Rpb24gdG9IZXggKG4pIHtcbiAgaWYgKG4gPCAxNikgcmV0dXJuICcwJyArIG4udG9TdHJpbmcoMTYpXG4gIHJldHVybiBuLnRvU3RyaW5nKDE2KVxufVxuXG5mdW5jdGlvbiB1dGY4VG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIHZhciBiID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBpZiAoYiA8PSAweDdGKVxuICAgICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkpXG4gICAgZWxzZSB7XG4gICAgICB2YXIgc3RhcnQgPSBpXG4gICAgICBpZiAoYiA+PSAweEQ4MDAgJiYgYiA8PSAweERGRkYpIGkrK1xuICAgICAgdmFyIGggPSBlbmNvZGVVUklDb21wb25lbnQoc3RyLnNsaWNlKHN0YXJ0LCBpKzEpKS5zdWJzdHIoMSkuc3BsaXQoJyUnKVxuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBoLmxlbmd0aDsgaisrKVxuICAgICAgICBieXRlQXJyYXkucHVzaChwYXJzZUludChoW2pdLCAxNikpXG4gICAgfVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVRvQnl0ZXMgKHN0cikge1xuICB2YXIgYywgaGksIGxvXG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIGMgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGhpID0gYyA+PiA4XG4gICAgbG8gPSBjICUgMjU2XG4gICAgYnl0ZUFycmF5LnB1c2gobG8pXG4gICAgYnl0ZUFycmF5LnB1c2goaGkpXG4gIH1cblxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFRvQnl0ZXMgKHN0cikge1xuICByZXR1cm4gYmFzZTY0LnRvQnl0ZUFycmF5KHN0cilcbn1cblxuZnVuY3Rpb24gYmxpdEJ1ZmZlciAoc3JjLCBkc3QsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBwb3NcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmICgoaSArIG9mZnNldCA+PSBkc3QubGVuZ3RoKSB8fCAoaSA+PSBzcmMubGVuZ3RoKSlcbiAgICAgIGJyZWFrXG4gICAgZHN0W2kgKyBvZmZzZXRdID0gc3JjW2ldXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gZGVjb2RlVXRmOENoYXIgKHN0cikge1xuICB0cnkge1xuICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc3RyKVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZSgweEZGRkQpIC8vIFVURiA4IGludmFsaWQgY2hhclxuICB9XG59XG5cbi8qXG4gKiBXZSBoYXZlIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSB2YWx1ZSBpcyBhIHZhbGlkIGludGVnZXIuIFRoaXMgbWVhbnMgdGhhdCBpdFxuICogaXMgbm9uLW5lZ2F0aXZlLiBJdCBoYXMgbm8gZnJhY3Rpb25hbCBjb21wb25lbnQgYW5kIHRoYXQgaXQgZG9lcyBub3RcbiAqIGV4Y2VlZCB0aGUgbWF4aW11bSBhbGxvd2VkIHZhbHVlLlxuICovXG5mdW5jdGlvbiB2ZXJpZnVpbnQgKHZhbHVlLCBtYXgpIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlID49IDAsICdzcGVjaWZpZWQgYSBuZWdhdGl2ZSB2YWx1ZSBmb3Igd3JpdGluZyBhbiB1bnNpZ25lZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBpcyBsYXJnZXIgdGhhbiBtYXhpbXVtIHZhbHVlIGZvciB0eXBlJylcbiAgYXNzZXJ0KE1hdGguZmxvb3IodmFsdWUpID09PSB2YWx1ZSwgJ3ZhbHVlIGhhcyBhIGZyYWN0aW9uYWwgY29tcG9uZW50Jylcbn1cblxuZnVuY3Rpb24gdmVyaWZzaW50ICh2YWx1ZSwgbWF4LCBtaW4pIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGxhcmdlciB0aGFuIG1heGltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA+PSBtaW4sICd2YWx1ZSBzbWFsbGVyIHRoYW4gbWluaW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KE1hdGguZmxvb3IodmFsdWUpID09PSB2YWx1ZSwgJ3ZhbHVlIGhhcyBhIGZyYWN0aW9uYWwgY29tcG9uZW50Jylcbn1cblxuZnVuY3Rpb24gdmVyaWZJRUVFNzU0ICh2YWx1ZSwgbWF4LCBtaW4pIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGxhcmdlciB0aGFuIG1heGltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA+PSBtaW4sICd2YWx1ZSBzbWFsbGVyIHRoYW4gbWluaW11bSBhbGxvd2VkIHZhbHVlJylcbn1cblxuZnVuY3Rpb24gYXNzZXJ0ICh0ZXN0LCBtZXNzYWdlKSB7XG4gIGlmICghdGVzdCkgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UgfHwgJ0ZhaWxlZCBhc3NlcnRpb24nKVxufVxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uXFxcXC4uXFxcXC4uXFxcXG5vZGVfbW9kdWxlc1xcXFxndWxwLWJyb3dzZXJpZnlcXFxcbm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnlcXFxcbm9kZV9tb2R1bGVzXFxcXGJ1ZmZlclxcXFxpbmRleC5qc1wiLFwiLy4uXFxcXC4uXFxcXC4uXFxcXG5vZGVfbW9kdWxlc1xcXFxndWxwLWJyb3dzZXJpZnlcXFxcbm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnlcXFxcbm9kZV9tb2R1bGVzXFxcXGJ1ZmZlclwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBsb29rdXAgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLyc7XG5cbjsoZnVuY3Rpb24gKGV4cG9ydHMpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG4gIHZhciBBcnIgPSAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKVxuICAgID8gVWludDhBcnJheVxuICAgIDogQXJyYXlcblxuXHR2YXIgUExVUyAgID0gJysnLmNoYXJDb2RlQXQoMClcblx0dmFyIFNMQVNIICA9ICcvJy5jaGFyQ29kZUF0KDApXG5cdHZhciBOVU1CRVIgPSAnMCcuY2hhckNvZGVBdCgwKVxuXHR2YXIgTE9XRVIgID0gJ2EnLmNoYXJDb2RlQXQoMClcblx0dmFyIFVQUEVSICA9ICdBJy5jaGFyQ29kZUF0KDApXG5cblx0ZnVuY3Rpb24gZGVjb2RlIChlbHQpIHtcblx0XHR2YXIgY29kZSA9IGVsdC5jaGFyQ29kZUF0KDApXG5cdFx0aWYgKGNvZGUgPT09IFBMVVMpXG5cdFx0XHRyZXR1cm4gNjIgLy8gJysnXG5cdFx0aWYgKGNvZGUgPT09IFNMQVNIKVxuXHRcdFx0cmV0dXJuIDYzIC8vICcvJ1xuXHRcdGlmIChjb2RlIDwgTlVNQkVSKVxuXHRcdFx0cmV0dXJuIC0xIC8vbm8gbWF0Y2hcblx0XHRpZiAoY29kZSA8IE5VTUJFUiArIDEwKVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBOVU1CRVIgKyAyNiArIDI2XG5cdFx0aWYgKGNvZGUgPCBVUFBFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBVUFBFUlxuXHRcdGlmIChjb2RlIDwgTE9XRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gTE9XRVIgKyAyNlxuXHR9XG5cblx0ZnVuY3Rpb24gYjY0VG9CeXRlQXJyYXkgKGI2NCkge1xuXHRcdHZhciBpLCBqLCBsLCB0bXAsIHBsYWNlSG9sZGVycywgYXJyXG5cblx0XHRpZiAoYjY0Lmxlbmd0aCAlIDQgPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3RyaW5nLiBMZW5ndGggbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQnKVxuXHRcdH1cblxuXHRcdC8vIHRoZSBudW1iZXIgb2YgZXF1YWwgc2lnbnMgKHBsYWNlIGhvbGRlcnMpXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHR3byBwbGFjZWhvbGRlcnMsIHRoYW4gdGhlIHR3byBjaGFyYWN0ZXJzIGJlZm9yZSBpdFxuXHRcdC8vIHJlcHJlc2VudCBvbmUgYnl0ZVxuXHRcdC8vIGlmIHRoZXJlIGlzIG9ubHkgb25lLCB0aGVuIHRoZSB0aHJlZSBjaGFyYWN0ZXJzIGJlZm9yZSBpdCByZXByZXNlbnQgMiBieXRlc1xuXHRcdC8vIHRoaXMgaXMganVzdCBhIGNoZWFwIGhhY2sgdG8gbm90IGRvIGluZGV4T2YgdHdpY2Vcblx0XHR2YXIgbGVuID0gYjY0Lmxlbmd0aFxuXHRcdHBsYWNlSG9sZGVycyA9ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAyKSA/IDIgOiAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMSkgPyAxIDogMFxuXG5cdFx0Ly8gYmFzZTY0IGlzIDQvMyArIHVwIHRvIHR3byBjaGFyYWN0ZXJzIG9mIHRoZSBvcmlnaW5hbCBkYXRhXG5cdFx0YXJyID0gbmV3IEFycihiNjQubGVuZ3RoICogMyAvIDQgLSBwbGFjZUhvbGRlcnMpXG5cblx0XHQvLyBpZiB0aGVyZSBhcmUgcGxhY2Vob2xkZXJzLCBvbmx5IGdldCB1cCB0byB0aGUgbGFzdCBjb21wbGV0ZSA0IGNoYXJzXG5cdFx0bCA9IHBsYWNlSG9sZGVycyA+IDAgPyBiNjQubGVuZ3RoIC0gNCA6IGI2NC5sZW5ndGhcblxuXHRcdHZhciBMID0gMFxuXG5cdFx0ZnVuY3Rpb24gcHVzaCAodikge1xuXHRcdFx0YXJyW0wrK10gPSB2XG5cdFx0fVxuXG5cdFx0Zm9yIChpID0gMCwgaiA9IDA7IGkgPCBsOyBpICs9IDQsIGogKz0gMykge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxOCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCAxMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA8PCA2KSB8IGRlY29kZShiNjQuY2hhckF0KGkgKyAzKSlcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMDAwKSA+PiAxNilcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMCkgPj4gOClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRpZiAocGxhY2VIb2xkZXJzID09PSAyKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPj4gNClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9IGVsc2UgaWYgKHBsYWNlSG9sZGVycyA9PT0gMSkge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxMCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCA0KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpID4+IDIpXG5cdFx0XHRwdXNoKCh0bXAgPj4gOCkgJiAweEZGKVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdHJldHVybiBhcnJcblx0fVxuXG5cdGZ1bmN0aW9uIHVpbnQ4VG9CYXNlNjQgKHVpbnQ4KSB7XG5cdFx0dmFyIGksXG5cdFx0XHRleHRyYUJ5dGVzID0gdWludDgubGVuZ3RoICUgMywgLy8gaWYgd2UgaGF2ZSAxIGJ5dGUgbGVmdCwgcGFkIDIgYnl0ZXNcblx0XHRcdG91dHB1dCA9IFwiXCIsXG5cdFx0XHR0ZW1wLCBsZW5ndGhcblxuXHRcdGZ1bmN0aW9uIGVuY29kZSAobnVtKSB7XG5cdFx0XHRyZXR1cm4gbG9va3VwLmNoYXJBdChudW0pXG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdHJpcGxldFRvQmFzZTY0IChudW0pIHtcblx0XHRcdHJldHVybiBlbmNvZGUobnVtID4+IDE4ICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDEyICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDYgJiAweDNGKSArIGVuY29kZShudW0gJiAweDNGKVxuXHRcdH1cblxuXHRcdC8vIGdvIHRocm91Z2ggdGhlIGFycmF5IGV2ZXJ5IHRocmVlIGJ5dGVzLCB3ZSdsbCBkZWFsIHdpdGggdHJhaWxpbmcgc3R1ZmYgbGF0ZXJcblx0XHRmb3IgKGkgPSAwLCBsZW5ndGggPSB1aW50OC5sZW5ndGggLSBleHRyYUJ5dGVzOyBpIDwgbGVuZ3RoOyBpICs9IDMpIHtcblx0XHRcdHRlbXAgPSAodWludDhbaV0gPDwgMTYpICsgKHVpbnQ4W2kgKyAxXSA8PCA4KSArICh1aW50OFtpICsgMl0pXG5cdFx0XHRvdXRwdXQgKz0gdHJpcGxldFRvQmFzZTY0KHRlbXApXG5cdFx0fVxuXG5cdFx0Ly8gcGFkIHRoZSBlbmQgd2l0aCB6ZXJvcywgYnV0IG1ha2Ugc3VyZSB0byBub3QgZm9yZ2V0IHRoZSBleHRyYSBieXRlc1xuXHRcdHN3aXRjaCAoZXh0cmFCeXRlcykge1xuXHRcdFx0Y2FzZSAxOlxuXHRcdFx0XHR0ZW1wID0gdWludDhbdWludDgubGVuZ3RoIC0gMV1cblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDIpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz09J1xuXHRcdFx0XHRicmVha1xuXHRcdFx0Y2FzZSAyOlxuXHRcdFx0XHR0ZW1wID0gKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDJdIDw8IDgpICsgKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMTApXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPj4gNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDIpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9J1xuXHRcdFx0XHRicmVha1xuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXRcblx0fVxuXG5cdGV4cG9ydHMudG9CeXRlQXJyYXkgPSBiNjRUb0J5dGVBcnJheVxuXHRleHBvcnRzLmZyb21CeXRlQXJyYXkgPSB1aW50OFRvQmFzZTY0XG59KHR5cGVvZiBleHBvcnRzID09PSAndW5kZWZpbmVkJyA/ICh0aGlzLmJhc2U2NGpzID0ge30pIDogZXhwb3J0cykpXG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiaHRaa3g0XCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi5cXFxcLi5cXFxcLi5cXFxcbm9kZV9tb2R1bGVzXFxcXGd1bHAtYnJvd3NlcmlmeVxcXFxub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeVxcXFxub2RlX21vZHVsZXNcXFxcYnVmZmVyXFxcXG5vZGVfbW9kdWxlc1xcXFxiYXNlNjQtanNcXFxcbGliXFxcXGI2NC5qc1wiLFwiLy4uXFxcXC4uXFxcXC4uXFxcXG5vZGVfbW9kdWxlc1xcXFxndWxwLWJyb3dzZXJpZnlcXFxcbm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnlcXFxcbm9kZV9tb2R1bGVzXFxcXGJ1ZmZlclxcXFxub2RlX21vZHVsZXNcXFxcYmFzZTY0LWpzXFxcXGxpYlwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbmV4cG9ydHMucmVhZCA9IGZ1bmN0aW9uKGJ1ZmZlciwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgbkJpdHMgPSAtNyxcbiAgICAgIGkgPSBpc0xFID8gKG5CeXRlcyAtIDEpIDogMCxcbiAgICAgIGQgPSBpc0xFID8gLTEgOiAxLFxuICAgICAgcyA9IGJ1ZmZlcltvZmZzZXQgKyBpXTtcblxuICBpICs9IGQ7XG5cbiAgZSA9IHMgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIHMgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBlTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBlID0gZSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBtID0gZSAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgZSA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IG1MZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IG0gPSBtICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIGlmIChlID09PSAwKSB7XG4gICAgZSA9IDEgLSBlQmlhcztcbiAgfSBlbHNlIGlmIChlID09PSBlTWF4KSB7XG4gICAgcmV0dXJuIG0gPyBOYU4gOiAoKHMgPyAtMSA6IDEpICogSW5maW5pdHkpO1xuICB9IGVsc2Uge1xuICAgIG0gPSBtICsgTWF0aC5wb3coMiwgbUxlbik7XG4gICAgZSA9IGUgLSBlQmlhcztcbiAgfVxuICByZXR1cm4gKHMgPyAtMSA6IDEpICogbSAqIE1hdGgucG93KDIsIGUgLSBtTGVuKTtcbn07XG5cbmV4cG9ydHMud3JpdGUgPSBmdW5jdGlvbihidWZmZXIsIHZhbHVlLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSwgYyxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBydCA9IChtTGVuID09PSAyMyA/IE1hdGgucG93KDIsIC0yNCkgLSBNYXRoLnBvdygyLCAtNzcpIDogMCksXG4gICAgICBpID0gaXNMRSA/IDAgOiAobkJ5dGVzIC0gMSksXG4gICAgICBkID0gaXNMRSA/IDEgOiAtMSxcbiAgICAgIHMgPSB2YWx1ZSA8IDAgfHwgKHZhbHVlID09PSAwICYmIDEgLyB2YWx1ZSA8IDApID8gMSA6IDA7XG5cbiAgdmFsdWUgPSBNYXRoLmFicyh2YWx1ZSk7XG5cbiAgaWYgKGlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA9PT0gSW5maW5pdHkpIHtcbiAgICBtID0gaXNOYU4odmFsdWUpID8gMSA6IDA7XG4gICAgZSA9IGVNYXg7XG4gIH0gZWxzZSB7XG4gICAgZSA9IE1hdGguZmxvb3IoTWF0aC5sb2codmFsdWUpIC8gTWF0aC5MTjIpO1xuICAgIGlmICh2YWx1ZSAqIChjID0gTWF0aC5wb3coMiwgLWUpKSA8IDEpIHtcbiAgICAgIGUtLTtcbiAgICAgIGMgKj0gMjtcbiAgICB9XG4gICAgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICB2YWx1ZSArPSBydCAvIGM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlICs9IHJ0ICogTWF0aC5wb3coMiwgMSAtIGVCaWFzKTtcbiAgICB9XG4gICAgaWYgKHZhbHVlICogYyA+PSAyKSB7XG4gICAgICBlKys7XG4gICAgICBjIC89IDI7XG4gICAgfVxuXG4gICAgaWYgKGUgKyBlQmlhcyA+PSBlTWF4KSB7XG4gICAgICBtID0gMDtcbiAgICAgIGUgPSBlTWF4O1xuICAgIH0gZWxzZSBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIG0gPSAodmFsdWUgKiBjIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSBlICsgZUJpYXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSB2YWx1ZSAqIE1hdGgucG93KDIsIGVCaWFzIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSAwO1xuICAgIH1cbiAgfVxuXG4gIGZvciAoOyBtTGVuID49IDg7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IG0gJiAweGZmLCBpICs9IGQsIG0gLz0gMjU2LCBtTGVuIC09IDgpO1xuXG4gIGUgPSAoZSA8PCBtTGVuKSB8IG07XG4gIGVMZW4gKz0gbUxlbjtcbiAgZm9yICg7IGVMZW4gPiAwOyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBlICYgMHhmZiwgaSArPSBkLCBlIC89IDI1NiwgZUxlbiAtPSA4KTtcblxuICBidWZmZXJbb2Zmc2V0ICsgaSAtIGRdIHw9IHMgKiAxMjg7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uXFxcXC4uXFxcXC4uXFxcXG5vZGVfbW9kdWxlc1xcXFxndWxwLWJyb3dzZXJpZnlcXFxcbm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnlcXFxcbm9kZV9tb2R1bGVzXFxcXGJ1ZmZlclxcXFxub2RlX21vZHVsZXNcXFxcaWVlZTc1NFxcXFxpbmRleC5qc1wiLFwiLy4uXFxcXC4uXFxcXC4uXFxcXG5vZGVfbW9kdWxlc1xcXFxndWxwLWJyb3dzZXJpZnlcXFxcbm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnlcXFxcbm9kZV9tb2R1bGVzXFxcXGJ1ZmZlclxcXFxub2RlX21vZHVsZXNcXFxcaWVlZTc1NFwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbnByb2Nlc3MubmV4dFRpY2sgPSAoZnVuY3Rpb24gKCkge1xuICAgIHZhciBjYW5TZXRJbW1lZGlhdGUgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5zZXRJbW1lZGlhdGU7XG4gICAgdmFyIGNhblBvc3QgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5wb3N0TWVzc2FnZSAmJiB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lclxuICAgIDtcblxuICAgIGlmIChjYW5TZXRJbW1lZGlhdGUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmKSB7IHJldHVybiB3aW5kb3cuc2V0SW1tZWRpYXRlKGYpIH07XG4gICAgfVxuXG4gICAgaWYgKGNhblBvc3QpIHtcbiAgICAgICAgdmFyIHF1ZXVlID0gW107XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24gKGV2KSB7XG4gICAgICAgICAgICB2YXIgc291cmNlID0gZXYuc291cmNlO1xuICAgICAgICAgICAgaWYgKChzb3VyY2UgPT09IHdpbmRvdyB8fCBzb3VyY2UgPT09IG51bGwpICYmIGV2LmRhdGEgPT09ICdwcm9jZXNzLXRpY2snKSB7XG4gICAgICAgICAgICAgICAgZXYuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgaWYgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZuID0gcXVldWUuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICAgICAgcXVldWUucHVzaChmbik7XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoJ3Byb2Nlc3MtdGljaycsICcqJyk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZm4sIDApO1xuICAgIH07XG59KSgpO1xuXG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn1cblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uXFxcXC4uXFxcXC4uXFxcXG5vZGVfbW9kdWxlc1xcXFxndWxwLWJyb3dzZXJpZnlcXFxcbm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnlcXFxcbm9kZV9tb2R1bGVzXFxcXHByb2Nlc3NcXFxcYnJvd3Nlci5qc1wiLFwiLy4uXFxcXC4uXFxcXC4uXFxcXG5vZGVfbW9kdWxlc1xcXFxndWxwLWJyb3dzZXJpZnlcXFxcbm9kZV9tb2R1bGVzXFxcXGJyb3dzZXJpZnlcXFxcbm9kZV9tb2R1bGVzXFxcXHByb2Nlc3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5tb2R1bGUuZXhwb3J0cyA9IGFuZ3VsYXIubW9kdWxlKCdhcHAuY29uZmlnJywgW10pO1xuLy9yZXF1aXJlKCcuL2NvbmZpZy5qcycpO1xucmVxdWlyZSgnLi9yb3V0ZXMuanMnKTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJodFpreDRcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLlxcXFxjb25maWdcXFxcX21vZHVsZV9pbml0LmpzXCIsXCIvLi5cXFxcY29uZmlnXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIG1vZHVsZSA9IHJlcXVpcmUoJy4vX21vZHVsZV9pbml0LmpzJyk7XG5tb2R1bGUuY29uZmlnKGZ1bmN0aW9uKCRzdGF0ZVByb3ZpZGVyLCAkdXJsUm91dGVyUHJvdmlkZXIsICRodHRwUHJvdmlkZXIpIHtcblx0ZGVsZXRlICRodHRwUHJvdmlkZXIuZGVmYXVsdHMuaGVhZGVycy5jb21tb25bJ1gtUmVxdWVzdGVkLVdpdGgnXTtcblx0JHVybFJvdXRlclByb3ZpZGVyLm90aGVyd2lzZSgnL2hvbWUnKTsgLy9ERUZBVUxUXG59KTtcblxubW9kdWxlLnJ1bihbXG5cdCckUUpIZWxwZXJGdW5jdGlvbnMnLCAnJFFKTG9nZ2VyJywgJyRRSkFwaScsICckcm9vdFNjb3BlJywgJyRsb2NhdGlvbicsICckdXJsUm91dGVyJywgJyRzdGF0ZScsICckdGltZW91dCcsXG5cdGZ1bmN0aW9uKCRRSkhlbHBlckZ1bmN0aW9ucywgJFFKTG9nZ2VyLCAkUUpBcGksICRyb290U2NvcGUsICRsb2NhdGlvbiwgJHVybFJvdXRlciwgJHN0YXRlLCAkdGltZW91dCkge1xuXG5cdFx0JHJvb3RTY29wZS4kb24oJyRzdGF0ZUNoYW5nZVN0YXJ0JywgZnVuY3Rpb24oZXZlbnQsIHRvU3RhdGUsIHRvUGFyYW1zLCBmcm9tU3RhdGUsIGZyb21QYXJhbXMpIHtcblx0XHRcdC8vXG5cdFx0XHR2YXIgbG9nZ2VkID0gJHJvb3RTY29wZS5zZXNzaW9uLnRva2VuICE9IG51bGw7XG5cdFx0XHRpZiAodG9TdGF0ZS5uYW1lICE9IFwibG9naW5cIiAmJiAhbG9nZ2VkKSB7XG5cdFx0XHRcdCRRSkxvZ2dlci5sb2coJ3J1biAtPiBzdGF0ZSAtPiBmb3JjZSByZWRpcmVjdGlvbicpO1xuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHQkUUpIZWxwZXJGdW5jdGlvbnMuY2hhbmdlU3RhdGUoJ2xvZ2luJyk7XG5cdFx0XHR9XG5cdFx0XHQvL1xuXHRcdH0pO1xuXG5cdH1cbl0pO1xuXG5tb2R1bGUuY29uZmlnKGZ1bmN0aW9uKCRzdGF0ZVByb3ZpZGVyLCAkdXJsUm91dGVyUHJvdmlkZXIsICRodHRwUHJvdmlkZXIpIHtcblxuY29uc29sZS5pbmZvKCdbUk9VVEVTXScpO1xuXG5cdCRzdGF0ZVByb3ZpZGVyXG5cdC5zdGF0ZSgnaG9tZScsIHtcblx0XHR1cmw6ICdeL2hvbWUnLFxuXHRcdHZpZXdzOiB7XG5cdFx0XHQnJzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL2hvbWUuaHRtbCcsXG5cdFx0XHRcdGNvbnRyb2xsZXI6ICdIb21lQ29udHJvbGxlcidcblx0XHRcdH0sXG5cdFx0XHQnbmF2Jzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL25hdi5odG1sJyxcblx0XHRcdFx0Y29udHJvbGxlcjogJ05hdkNvbnRyb2xsZXInXG5cdFx0XHR9LFxuXHRcdFx0J3NpZGViYXInOiB7XG5cdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvc2lkZWJhci5odG1sJyxcblx0XHRcdFx0Y29udHJvbGxlcjogJ1NpZGViYXJDb250cm9sbGVyJ1xuXHRcdFx0fVxuXHRcdH1cblx0fSlcblxuXHQuc3RhdGUoJ2xvZ2luJywge1xuXHRcdHVybDogJ14vbG9naW4nLFxuXHRcdHZpZXdzOiB7XG5cdFx0XHQnJzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL2xvZ2luLmh0bWwnLFxuXHRcdFx0XHRjb250cm9sbGVyOiAnTG9naW5Db250cm9sbGVyJ1xuXHRcdFx0fSxcblx0XHRcdCduYXYnOiB7XG5cdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvZW1wdHlfbmF2Lmh0bWwnXG5cdFx0XHR9LFxuXHRcdFx0J3NpZGViYXInOiB7XG5cdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvZW1wdHkuaHRtbCdcblx0XHRcdH1cblx0XHR9XG5cdH0pXG5cblxuXG5cdC5zdGF0ZSgnZXJyb3ItcmVzcG9uc2UtaGFzLWVycm9ycycsIHtcblx0XHR1cmw6ICdeL2FwaWVycm9yaW52YWxpZHJlc3BvbnNlJyxcblx0XHR2aWV3czoge1xuXHRcdFx0Jyc6IHtcblx0XHRcdFx0dGVtcGxhdGVVcmw6ICdwYWdlcy9lcnJvcnMvYXBpLnJlc3BvbnNlLmhhcy5lcnJvcnMuaHRtbCdcblx0XHRcdH0sXG5cdFx0XHQnbmF2Jzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL2VtcHR5X25hdi5odG1sJ1xuXHRcdFx0fSxcblx0XHRcdCdzaWRlYmFyJzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL2VtcHR5Lmh0bWwnXG5cdFx0XHR9XG5cdFx0fVxuXHR9KVxuXG5cdC5zdGF0ZSgnZXJyb3ItaW52YWxpZC1yZXNwb25zZScsIHtcblx0XHR1cmw6ICdeL2FwaWVycm9yaW52YWxpZHJlc3BvbnNlJyxcblx0XHR2aWV3czoge1xuXHRcdFx0Jyc6IHtcblx0XHRcdFx0dGVtcGxhdGVVcmw6ICdwYWdlcy9lcnJvcnMvYXBpLmludmFsaWQucmVzcG9uc2UuaHRtbCdcblx0XHRcdH0sXG5cdFx0XHQnbmF2Jzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL2VtcHR5X25hdi5odG1sJ1xuXHRcdFx0fSxcblx0XHRcdCdzaWRlYmFyJzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL2VtcHR5Lmh0bWwnXG5cdFx0XHR9XG5cdFx0fVxuXHR9KVxuXG5cdC5zdGF0ZSgnZXJyb3ItYXBpJywge1xuXHRcdHVybDogJ14vYXBpZXJyb3InLFxuXHRcdHZpZXdzOiB7XG5cdFx0XHQnJzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL2Vycm9ycy9hcGkuaHRtbCdcblx0XHRcdH0sXG5cdFx0XHQnbmF2Jzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL2VtcHR5X25hdi5odG1sJ1xuXHRcdFx0fSxcblx0XHRcdCdzaWRlYmFyJzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL2VtcHR5Lmh0bWwnXG5cdFx0XHR9XG5cdFx0fVxuXHR9KVxuXG5cblx0Ly9NRU5VU1xuXHQuc3RhdGUoJ21vZHVsZS1tZW51LWxpc3QnLCB7XG5cdFx0dXJsOiAnXi9tZW51cycsXG5cdFx0dmlld3M6IHtcblx0XHRcdCcnOiB7XG5cdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvbWVudS9tZW51Lmxpc3QuaHRtbCcsXG5cdFx0XHRcdGNvbnRyb2xsZXI6ICdNZW51TGlzdENvbnRyb2xsZXInXG5cdFx0XHR9LFxuXHRcdFx0J25hdic6IHtcblx0XHRcdFx0dGVtcGxhdGVVcmw6ICdwYWdlcy9uYXYuaHRtbCcsXG5cdFx0XHRcdGNvbnRyb2xsZXI6ICdOYXZDb250cm9sbGVyJ1xuXHRcdFx0fSxcblx0XHRcdCdzaWRlYmFyJzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL3NpZGViYXIuaHRtbCcsXG5cdFx0XHRcdGNvbnRyb2xsZXI6ICdTaWRlYmFyQ29udHJvbGxlcidcblx0XHRcdH1cblx0XHR9XG5cdH0pXG5cdFx0LnN0YXRlKCdtb2R1bGUtbWVudS1lZGl0Jywge1xuXHRcdFx0dXJsOiAnXi9tZW51LzppZCcsXG5cdFx0XHR2aWV3czoge1xuXHRcdFx0XHQnJzoge1xuXHRcdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvbWVudS9tZW51LmVkaXQuaHRtbCcsXG5cdFx0XHRcdFx0Y29udHJvbGxlcjogJ01lbnVFZGl0Q29udHJvbGxlcidcblx0XHRcdFx0fSxcblx0XHRcdFx0J25hdic6IHtcblx0XHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL25hdi5odG1sJyxcblx0XHRcdFx0XHRjb250cm9sbGVyOiAnTmF2Q29udHJvbGxlcidcblx0XHRcdFx0fSxcblx0XHRcdFx0J3NpZGViYXInOiB7XG5cdFx0XHRcdFx0dGVtcGxhdGVVcmw6ICdwYWdlcy9zaWRlYmFyLmh0bWwnLFxuXHRcdFx0XHRcdGNvbnRyb2xsZXI6ICdTaWRlYmFyQ29udHJvbGxlcidcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pXG5cblxuXHQuc3RhdGUoJ21vZHVsZS1wcm9maWxlLWxpc3QnLCB7XG5cdFx0dXJsOiAnXi9wcm9maWxlcycsXG5cdFx0dmlld3M6IHtcblx0XHRcdCcnOiB7XG5cdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvcHJvZmlsZS9wcm9maWxlLmxpc3QuaHRtbCcsXG5cdFx0XHRcdGNvbnRyb2xsZXI6ICdQcm9maWxlTGlzdENvbnRyb2xsZXInXG5cdFx0XHR9LFxuXHRcdFx0J25hdic6IHtcblx0XHRcdFx0dGVtcGxhdGVVcmw6ICdwYWdlcy9uYXYuaHRtbCcsXG5cdFx0XHRcdGNvbnRyb2xsZXI6ICdOYXZDb250cm9sbGVyJ1xuXHRcdFx0fSxcblx0XHRcdCdzaWRlYmFyJzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL3NpZGViYXIuaHRtbCcsXG5cdFx0XHRcdGNvbnRyb2xsZXI6ICdTaWRlYmFyQ29udHJvbGxlcidcblx0XHRcdH1cblx0XHR9XG5cdH0pXG5cdFx0LnN0YXRlKCdtb2R1bGUtcHJvZmlsZS1lZGl0Jywge1xuXHRcdFx0dXJsOiAnXi9wcm9maWxlcy86aWQnLFxuXHRcdFx0dmlld3M6IHtcblx0XHRcdFx0Jyc6IHtcblx0XHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL3Byb2ZpbGUvcHJvZmlsZS5lZGl0Lmh0bWwnLFxuXHRcdFx0XHRcdGNvbnRyb2xsZXI6ICdQcm9maWxlRWRpdENvbnRyb2xsZXInXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCduYXYnOiB7XG5cdFx0XHRcdFx0dGVtcGxhdGVVcmw6ICdwYWdlcy9uYXYuaHRtbCcsXG5cdFx0XHRcdFx0Y29udHJvbGxlcjogJ05hdkNvbnRyb2xsZXInXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdzaWRlYmFyJzoge1xuXHRcdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvc2lkZWJhci5odG1sJyxcblx0XHRcdFx0XHRjb250cm9sbGVyOiAnU2lkZWJhckNvbnRyb2xsZXInXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KVxuXG5cdC5zdGF0ZSgnbW9kdWxlLXVzZXJncm91cC1saXN0Jywge1xuXHRcdHVybDogJ14vdXNlcmdyb3VwcycsXG5cdFx0dmlld3M6IHtcblx0XHRcdCcnOiB7XG5cdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvdXNlcnMvdXNlcmdyb3VwLmxpc3QuaHRtbCcsXG5cdFx0XHRcdGNvbnRyb2xsZXI6ICdVc2VyZ3JvdXBMaXN0Q29udHJvbGxlcidcblx0XHRcdH0sXG5cdFx0XHQnbmF2Jzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL25hdi5odG1sJyxcblx0XHRcdFx0Y29udHJvbGxlcjogJ05hdkNvbnRyb2xsZXInXG5cdFx0XHR9LFxuXHRcdFx0J3NpZGViYXInOiB7XG5cdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvc2lkZWJhci5odG1sJyxcblx0XHRcdFx0Y29udHJvbGxlcjogJ1NpZGViYXJDb250cm9sbGVyJ1xuXHRcdFx0fVxuXHRcdH1cblx0fSlcblx0XHQuc3RhdGUoJ21vZHVsZS11c2VyZ3JvdXAtZWRpdCcsIHtcblx0XHRcdHVybDogJ14vdXNlcmdyb3Vwcy86aWQnLFxuXHRcdFx0dmlld3M6IHtcblx0XHRcdFx0Jyc6IHtcblx0XHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL3VzZXJzL3VzZXJncm91cC5lZGl0Lmh0bWwnLFxuXHRcdFx0XHRcdGNvbnRyb2xsZXI6ICdVc2VyZ3JvdXBFZGl0Q29udHJvbGxlcidcblx0XHRcdFx0fSxcblx0XHRcdFx0J25hdic6IHtcblx0XHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL25hdi5odG1sJyxcblx0XHRcdFx0XHRjb250cm9sbGVyOiAnTmF2Q29udHJvbGxlcidcblx0XHRcdFx0fSxcblx0XHRcdFx0J3NpZGViYXInOiB7XG5cdFx0XHRcdFx0dGVtcGxhdGVVcmw6ICdwYWdlcy9zaWRlYmFyLmh0bWwnLFxuXHRcdFx0XHRcdGNvbnRyb2xsZXI6ICdTaWRlYmFyQ29udHJvbGxlcidcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pXG5cblxuXG5cdC5zdGF0ZSgnbW9kdWxlLXVzZXItbGlzdCcsIHtcblx0XHR1cmw6ICdeL3VzZXJzJyxcblx0XHR2aWV3czoge1xuXHRcdFx0Jyc6IHtcblx0XHRcdFx0dGVtcGxhdGVVcmw6ICdwYWdlcy91c2Vycy91c2Vycy5saXN0Lmh0bWwnLFxuXHRcdFx0XHRjb250cm9sbGVyOiAnVXNlckxpc3RDb250cm9sbGVyJ1xuXHRcdFx0fSxcblx0XHRcdCduYXYnOiB7XG5cdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvbmF2Lmh0bWwnLFxuXHRcdFx0XHRjb250cm9sbGVyOiAnTmF2Q29udHJvbGxlcidcblx0XHRcdH0sXG5cdFx0XHQnc2lkZWJhcic6IHtcblx0XHRcdFx0dGVtcGxhdGVVcmw6ICdwYWdlcy9zaWRlYmFyLmh0bWwnLFxuXHRcdFx0XHRjb250cm9sbGVyOiAnU2lkZWJhckNvbnRyb2xsZXInXG5cdFx0XHR9XG5cdFx0fVxuXHR9KVxuXHRcdC5zdGF0ZSgnbW9kdWxlLXVzZXItZWRpdCcsIHtcblx0XHRcdHVybDogJ14vdXNlci86aWQnLFxuXHRcdFx0dmlld3M6IHtcblx0XHRcdFx0Jyc6IHtcblx0XHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL3VzZXJzL3VzZXJzLmVkaXQuaHRtbCcsXG5cdFx0XHRcdFx0Y29udHJvbGxlcjogJ1VzZXJFZGl0Q29udHJvbGxlcidcblx0XHRcdFx0fSxcblx0XHRcdFx0J25hdic6IHtcblx0XHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL25hdi5odG1sJyxcblx0XHRcdFx0XHRjb250cm9sbGVyOiAnTmF2Q29udHJvbGxlcidcblx0XHRcdFx0fSxcblx0XHRcdFx0J3NpZGViYXInOiB7XG5cdFx0XHRcdFx0dGVtcGxhdGVVcmw6ICdwYWdlcy9zaWRlYmFyLmh0bWwnLFxuXHRcdFx0XHRcdGNvbnRyb2xsZXI6ICdTaWRlYmFyQ29udHJvbGxlcidcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pXG5cblx0LnN0YXRlKCdtb2R1bGUtdXNlci1teXByb2ZpbGUtZWRpdCcsIHtcblx0XHR1cmw6ICdeL215cHJvZmlsZS86aWQnLFxuXHRcdHZpZXdzOiB7XG5cdFx0XHQnJzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL3VzZXJzL3VzZXJzLm15cHJvZmlsZS5lZGl0Lmh0bWwnLFxuXHRcdFx0XHRjb250cm9sbGVyOiAnVXNlckVkaXRDb250cm9sbGVyJ1xuXHRcdFx0fSxcblx0XHRcdCduYXYnOiB7XG5cdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvbmF2Lmh0bWwnLFxuXHRcdFx0XHRjb250cm9sbGVyOiAnTmF2Q29udHJvbGxlcidcblx0XHRcdH0sXG5cdFx0XHQnc2lkZWJhcic6IHtcblx0XHRcdFx0dGVtcGxhdGVVcmw6ICdwYWdlcy9zaWRlYmFyLmh0bWwnLFxuXHRcdFx0XHRjb250cm9sbGVyOiAnU2lkZWJhckNvbnRyb2xsZXInXG5cdFx0XHR9XG5cdFx0fVxuXHR9KVxuXG5cdC5zdGF0ZSgnbW9kdWxlLXByb2plY3QtbGlzdCcsIHtcblx0XHR1cmw6ICdeL3Byb2plY3QnLFxuXHRcdHZpZXdzOiB7XG5cdFx0XHQnJzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL3Byb2plY3QvcHJvamVjdC5saXN0Lmh0bWwnLFxuXHRcdFx0XHRjb250cm9sbGVyOiAnUHJvamVjdExpc3RDb250cm9sbGVyJ1xuXHRcdFx0fSxcblx0XHRcdCduYXYnOiB7XG5cdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvbmF2Lmh0bWwnLFxuXHRcdFx0XHRjb250cm9sbGVyOiAnTmF2Q29udHJvbGxlcidcblx0XHRcdH0sXG5cdFx0XHQnc2lkZWJhcic6IHtcblx0XHRcdFx0dGVtcGxhdGVVcmw6ICdwYWdlcy9zaWRlYmFyLmh0bWwnLFxuXHRcdFx0XHRjb250cm9sbGVyOiAnU2lkZWJhckNvbnRyb2xsZXInXG5cdFx0XHR9XG5cdFx0fVxuXHR9KVxuXHRcdC5zdGF0ZSgnbW9kdWxlLXByb2plY3QtZWRpdCcsIHtcblx0XHRcdHVybDogJ14vcHJvamVjdC86aWQnLFxuXHRcdFx0dmlld3M6IHtcblx0XHRcdFx0Jyc6IHtcblx0XHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL3Byb2plY3QvcHJvamVjdC5lZGl0Lmh0bWwnLFxuXHRcdFx0XHRcdGNvbnRyb2xsZXI6ICdQcm9qZWN0RWRpdENvbnRyb2xsZXInXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCduYXYnOiB7XG5cdFx0XHRcdFx0dGVtcGxhdGVVcmw6ICdwYWdlcy9uYXYuaHRtbCcsXG5cdFx0XHRcdFx0Y29udHJvbGxlcjogJ05hdkNvbnRyb2xsZXInXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdzaWRlYmFyJzoge1xuXHRcdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvc2lkZWJhci5odG1sJyxcblx0XHRcdFx0XHRjb250cm9sbGVyOiAnU2lkZWJhckNvbnRyb2xsZXInXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KVxuXG5cdC5zdGF0ZSgnbW9kdWxlLXByb2plY3QtaG91cnMtbGlzdCcsIHtcblx0XHR1cmw6ICdeL3Byb2plY3Rob3VycycsXG5cdFx0dmlld3M6IHtcblx0XHRcdCcnOiB7XG5cdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvcHJvamVjdC9wcm9qZWN0LmhvdXJzLmxpc3QuaHRtbCcsXG5cdFx0XHRcdGNvbnRyb2xsZXI6ICdQcm9qZWN0SG91cnNMaXN0Q29udHJvbGxlcidcblx0XHRcdH0sXG5cdFx0XHQnbmF2Jzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL25hdi5odG1sJyxcblx0XHRcdFx0Y29udHJvbGxlcjogJ05hdkNvbnRyb2xsZXInXG5cdFx0XHR9LFxuXHRcdFx0J3NpZGViYXInOiB7XG5cdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvc2lkZWJhci5odG1sJyxcblx0XHRcdFx0Y29udHJvbGxlcjogJ1NpZGViYXJDb250cm9sbGVyJ1xuXHRcdFx0fVxuXHRcdH1cblx0fSlcblx0XHQuc3RhdGUoJ21vZHVsZS1wcm9qZWN0LWhvdXJzLWVkaXQnLCB7XG5cdFx0XHR1cmw6ICdeL3Byb2plY3Rob3Vycy86aWQnLFxuXHRcdFx0dmlld3M6IHtcblx0XHRcdFx0Jyc6IHtcblx0XHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL3Byb2plY3QvcHJvamVjdC5ob3Vycy5lZGl0Lmh0bWwnLFxuXHRcdFx0XHRcdGNvbnRyb2xsZXI6ICdQcm9qZWN0SG91cnNFZGl0Q29udHJvbGxlcidcblx0XHRcdFx0fSxcblx0XHRcdFx0J25hdic6IHtcblx0XHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL25hdi5odG1sJyxcblx0XHRcdFx0XHRjb250cm9sbGVyOiAnTmF2Q29udHJvbGxlcidcblx0XHRcdFx0fSxcblx0XHRcdFx0J3NpZGViYXInOiB7XG5cdFx0XHRcdFx0dGVtcGxhdGVVcmw6ICdwYWdlcy9zaWRlYmFyLmh0bWwnLFxuXHRcdFx0XHRcdGNvbnRyb2xsZXI6ICdTaWRlYmFyQ29udHJvbGxlcidcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pXG5cblxuXHQuc3RhdGUoJ21vZHVsZS1zZXR0aW5ncycsIHtcblx0XHR1cmw6ICdeL3NldHRpbmdzJyxcblx0XHR2aWV3czoge1xuXHRcdFx0Jyc6IHtcblx0XHRcdFx0dGVtcGxhdGVVcmw6ICdwYWdlcy9zZXR0aW5ncy9xai5zZXR0aW5ncy5odG1sJyxcblx0XHRcdFx0Y29udHJvbGxlcjogJ1FKQmFja2VuZFNldHRpbmdzQ29udHJvbGxlcidcblx0XHRcdH0sXG5cdFx0XHQnbmF2Jzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL25hdi5odG1sJyxcblx0XHRcdFx0Y29udHJvbGxlcjogJ05hdkNvbnRyb2xsZXInXG5cdFx0XHR9LFxuXHRcdFx0J3NpZGViYXInOiB7XG5cdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvc2lkZWJhci5odG1sJyxcblx0XHRcdFx0Y29udHJvbGxlcjogJ1NpZGViYXJDb250cm9sbGVyJ1xuXHRcdFx0fVxuXHRcdH1cblx0fSlcblxuXG5cdC5zdGF0ZSgnbW9kdWxlLXZpcHN0ZXItc2V0dGluZ3MnLCB7XG5cdFx0dXJsOiAnXi92aXBzdGVyL3NldHRpbmdzJyxcblx0XHR2aWV3czoge1xuXHRcdFx0Jyc6IHtcblx0XHRcdFx0dGVtcGxhdGVVcmw6ICdwYWdlcy92aXBzdGVyL3ZpcHN0ZXIuc2V0dGluZ3MuaHRtbCcsXG5cdFx0XHRcdGNvbnRyb2xsZXI6ICdWaXBzdGVyQ29uZmlnQ29udHJvbGxlcidcblx0XHRcdH0sXG5cdFx0XHQnbmF2Jzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL25hdi5odG1sJyxcblx0XHRcdFx0Y29udHJvbGxlcjogJ05hdkNvbnRyb2xsZXInXG5cdFx0XHR9LFxuXHRcdFx0J3NpZGViYXInOiB7XG5cdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvc2lkZWJhci5odG1sJyxcblx0XHRcdFx0Y29udHJvbGxlcjogJ1NpZGViYXJDb250cm9sbGVyJ1xuXHRcdFx0fVxuXHRcdH1cblx0fSlcblxuXHQuc3RhdGUoJ21vZHVsZS1jaGF0Jywge1xuXHRcdHVybDogJ14vY2hhdCcsXG5cdFx0dmlld3M6IHtcblx0XHRcdCcnOiB7XG5cdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvY2hhdC9jaGF0Lm1haW4uaHRtbCcsXG5cdFx0XHRcdGNvbnRyb2xsZXI6ICdDaGF0Q29udHJvbGxlcidcblx0XHRcdH0sXG5cdFx0XHQnbmF2Jzoge1xuXHRcdFx0XHR0ZW1wbGF0ZVVybDogJ3BhZ2VzL25hdi5odG1sJyxcblx0XHRcdFx0Y29udHJvbGxlcjogJ05hdkNvbnRyb2xsZXInXG5cdFx0XHR9LFxuXHRcdFx0J3NpZGViYXInOiB7XG5cdFx0XHRcdHRlbXBsYXRlVXJsOiAncGFnZXMvc2lkZWJhci5odG1sJyxcblx0XHRcdFx0Y29udHJvbGxlcjogJ1NpZGViYXJDb250cm9sbGVyJ1xuXHRcdFx0fVxuXHRcdH1cblx0fSlcblxuXG5cblx0O1xufSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uXFxcXGNvbmZpZ1xcXFxyb3V0ZXMuanNcIixcIi8uLlxcXFxjb25maWdcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5tb2R1bGUuZXhwb3J0cyA9IGFuZ3VsYXIubW9kdWxlKCdhcHAuY29udHJvbGxlcnMnLCBbJ2FwcC5jb250cm9scyddKTtcbnJlcXVpcmUoJy4vYXBwQ3RybC5qcycpO1xucmVxdWlyZSgnLi9jaGF0Q3RybC5qcycpO1xucmVxdWlyZSgnLi9ob21lQ3RybC5qcycpO1xucmVxdWlyZSgnLi9sb2dpbkN0cmwuanMnKTtcbnJlcXVpcmUoJy4vbW9kLm1lbnVDdHJsLmpzJyk7XG5yZXF1aXJlKCcuL21vZC5wcm9maWxlQ3RybC5qcycpO1xucmVxdWlyZSgnLi9tb2QucHJvamVjdGhvdXJzQ3RybC5qcycpO1xucmVxdWlyZSgnLi9tb2QucHJvamVjdHNDdHJsLmpzJyk7XG5yZXF1aXJlKCcuL21vZC51c2VyZ3JvdXBDdHJsLmpzJyk7XG5yZXF1aXJlKCcuL21vZC51c2Vyc0N0cmwuanMnKTtcbnJlcXVpcmUoJy4vbmF2Q3RybC5qcycpO1xucmVxdWlyZSgnLi9zZXR0aW5nc0N0cmwuanMnKTtcbnJlcXVpcmUoJy4vc2lkZWJhckN0cmwuanMnKTtcbnJlcXVpcmUoJy4vdnAuY29uZmlnQ3RybC5qcycpO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJodFpreDRcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLlxcXFxjb250cm9sbGVyc1xcXFxfbW9kdWxlX2luaXQuanNcIixcIi8uLlxcXFxjb250cm9sbGVyc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBtb2R1bGUgPSByZXF1aXJlKCcuL19tb2R1bGVfaW5pdC5qcycpO1xubW9kdWxlLmNvbnRyb2xsZXIoJ0FwcENvbnRyb2xsZXInLCBmdW5jdGlvbihcblx0JFFKTG9nZ2VyLCAkUUpIZWxwZXJGdW5jdGlvbnMsICRzY29wZSwgJHJvb3RTY29wZSwgJFFKTG9naW5Nb2R1bGUsICRRSkFwaSwgJHRpbWVvdXQsICRzdGF0ZSwgJFFKTG9naW5Nb2R1bGVcbikge1xuXHQkUUpMb2dnZXIubG9nKFwiQXBwQ29udHJvbGxlciAtPiBpbml0aWFsaXplZFwiKTtcblx0Ly8kUUpIZWxwZXJGdW5jdGlvbnMuY2hlY2tBUElBbmRHb1RvQXBpRXJyb3JTdGF0ZUlmVGhlcmVJc0FQcm9ibGVtKCk7XG5cdCRRSkhlbHBlckZ1bmN0aW9ucy5jaGVja1Rva2VuRXhwaXJhdGlvbkFuZEdvVG9Mb2dpblN0YXRlSWZIYXNFeHBpcmVkKCk7XG59KTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiaHRaa3g0XCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi5cXFxcY29udHJvbGxlcnNcXFxcYXBwQ3RybC5qc1wiLFwiLy4uXFxcXGNvbnRyb2xsZXJzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIG1vZHVsZSA9IHJlcXVpcmUoJy4vX21vZHVsZV9pbml0LmpzJyk7XG5tb2R1bGUuY29udHJvbGxlcignQ2hhdENvbnRyb2xsZXInLCBmdW5jdGlvbihcblx0JFFKQ0NvbWJvYm94LCAkUUpDU2VsZWN0a2V5LCAkUUpDTGlzdHZpZXcsICRRSkNGaWx0ZXIsICRRSkxvZ2dlciwgJFFKSGVscGVyRnVuY3Rpb25zLCAkc2NvcGUsICRyb290U2NvcGUsICRRSkxvZ2luTW9kdWxlLCAkUUpBcGksICR0aW1lb3V0LCAkc3RhdGUsICRRSkxvZ2luTW9kdWxlXG4pIHtcblx0JFFKTG9nZ2VyLmxvZyhcIkNoYXRDb250cm9sbGVyIC0+IGluaXRpYWxpemVkXCIpO1xuXG5cblx0JHNjb3BlLmJyZWFkY3J1bWIgPSB7XG5cdFx0bmFtZTogJ0NoYXQnLFxuXHRcdGxpc3Q6IFtcblx0XHRcdC8ve25hbWU6J05vbmUyJyxzdGF0ZTonJyxmYTonZmEtZGFzaGJvYXJkJ31cblx0XHRdLFxuXHRcdGFjdGl2ZTogXCJDaGF0XCJcblx0fTtcblxuXG5cdCRzY29wZS5pbnB1dCA9IFwiXCI7XG5cdCRzY29wZS5pdGVtcyA9IFt7XG5cdFx0c2VuZGVyOiBcIlBlcGVcIixcblx0XHRtZXNzYWdlOiBcIkJsYWJsYVwiXG5cdH0sIHtcblx0XHRzZW5kZXI6IFwiUGVwZSAyXCIsXG5cdFx0bWVzc2FnZTogXCJCbGFibGFcIlxuXHR9XTtcblxuXG5cblx0Lypcblx0XHR2YXIgb2JqID0gSlNPTi5wYXJzZShlLmRhdGEpO1xuXHRcdGNvbnNvbGUuaW5mbyhvYmopO1xuXHRcdCR0aW1lb3V0KGZ1bmN0aW9uKCl7XG5cdFx0XHQkc2NvcGUuJGFwcGx5KGZ1bmN0aW9uKCl7XG5cdFx0XHRcdCRzY29wZS5pdGVtcy5wdXNoKG9iaik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0Ki9cblxuXG5cdCRzY29wZS5lbnRlciA9IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBuZXdJdGVtID0ge1xuXHRcdFx0bG9naW5uYW1lOiAkcm9vdFNjb3BlLnNlc3Npb24ubG9naW5uYW1lLFxuXHRcdFx0bWVzc2FnZTogJHNjb3BlLmlucHV0XG5cdFx0fTtcblx0XHQkc2NvcGUuaXRlbXMudW5zaGlmdChuZXdJdGVtKTtcblx0XHQkc2NvcGUuaW5wdXQgPSBcIlwiO1xuXHRcdC8vXG5cdFx0JFFKQXBpLmdldENvbnRyb2xsZXIoJ2NoYXQnKS5wb3N0KHtcblx0XHRcdGFjdGlvbjogJ3NhdmUnXG5cdFx0fSwge1xuXHRcdFx0bWVzc2FnZTogbmV3SXRlbS5tZXNzYWdlLFxuXHRcdFx0X2NoYXRfaWQ6IDFcblx0XHR9LCBmdW5jdGlvbihyZXMpIHtcblx0XHRcdCRRSkxvZ2dlci5sb2coXCJDaGF0Q29udHJvbGxlciAtPiBQT1NUIGNoYXQgc2F2ZSAtPiBzdWNjZXNzXCIpO1xuXHRcdFx0dXBkYXRlKCk7XG5cdFx0fSk7XG5cdH07XG5cblxuXG5cdGZ1bmN0aW9uIHVwZGF0ZSgpIHtcblx0XHQkUUpBcGkuZ2V0Q29udHJvbGxlcignY2hhdCcpLmdldCh7XG5cdFx0XHRhY3Rpb246ICdsaXN0J1xuXHRcdH0sIGZ1bmN0aW9uKHJlcykge1xuXHRcdFx0JFFKTG9nZ2VyLmxvZyhcIkNoYXRDb250cm9sbGVyIC0+IEdFVCBjaGF0IGxpc3QgLT4gc3VjY2Vzc1wiKTtcblx0XHRcdCRzY29wZS5pdGVtcyA9IF8uc29ydEJ5KHJlcy5pdGVtcywgZnVuY3Rpb24oaXRlbSkge1xuXHRcdFx0XHRyZXR1cm4gaXRlbS5faWQgKiAtMTtcblx0XHRcdH0pO1xuXHRcdFx0Y29uc29sZS5pbmZvKHJlcy5pdGVtcyk7XG5cdFx0fSk7XG5cdH1cblx0dXBkYXRlKCk7XG5cblx0dmFyIG15VmFyID0gc2V0SW50ZXJ2YWwodXBkYXRlLCA1MDAwKTtcblxuXHQkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3RhcnQnLFxuXHRcdGZ1bmN0aW9uKGV2ZW50LCB0b1N0YXRlLCB0b1BhcmFtcywgZnJvbVN0YXRlLCBmcm9tUGFyYW1zKSB7XG5cblx0XHRcdGlmIChmcm9tU3RhdGUubmFtZSA9PT0gXCJtb2R1bGUtY2hhdFwiKSB7XG5cdFx0XHRcdGNsZWFySW50ZXJ2YWwobXlWYXIpO1xuXHRcdFx0fVxuXG5cdFx0fSk7XG5cbn0pXG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiaHRaa3g0XCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi5cXFxcY29udHJvbGxlcnNcXFxcY2hhdEN0cmwuanNcIixcIi8uLlxcXFxjb250cm9sbGVyc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBtb2R1bGUgPSByZXF1aXJlKCcuL19tb2R1bGVfaW5pdC5qcycpO1xubW9kdWxlLmNvbnRyb2xsZXIoJ0hvbWVDb250cm9sbGVyJywgZnVuY3Rpb24oXG5cdCRRSkF1dGgsICRRSkNDb21ib2JveCwgJFFKTG9nZ2VyLCAkc2NvcGUsICRyb290U2NvcGUsICRRSkxvZ2luTW9kdWxlLCAkUUpMb2NhbFNlc3Npb24sICRRSkNvbmZpZywgJFFKQXBpKSB7XG5cdCRRSkxvZ2dlci5sb2coXCJIb21lQ29udHJvbGxlciAtPiBpbml0aWFsaXplZFwiKTtcblxuXHQkc2NvcGUuYnJlYWRjcnVtYiA9IHtcblx0XHRuYW1lOiAnRGFzaGJvYXJkJyxcblx0XHRsaXN0OiBbXG5cdFx0XHQvL3tuYW1lOlwiTm9uZTFcIixzdGF0ZTonbW9kdWxlLXByb2plY3QtbGlzdCcsZmE6J2ZhLWRhc2hib2FyZCd9LFxuXHRcdFx0Ly97bmFtZTonTm9uZTInLHN0YXRlOicnLGZhOidmYS1kYXNoYm9hcmQnfVxuXHRcdF0sXG5cdFx0YWN0aXZlOiBcIkRhc2hib2FyZFwiXG5cdH07XG5cblxufSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uXFxcXGNvbnRyb2xsZXJzXFxcXGhvbWVDdHJsLmpzXCIsXCIvLi5cXFxcY29udHJvbGxlcnNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgbW9kdWxlID0gcmVxdWlyZSgnLi9fbW9kdWxlX2luaXQuanMnKTtcbm1vZHVsZS5jb250cm9sbGVyKCdMb2dpbkNvbnRyb2xsZXInLCBmdW5jdGlvbihcbiAgICAkUUpMb2dnZXIsXG4gICAgJHNjb3BlLCAkcm9vdFNjb3BlLCAkUUpMb2dpbk1vZHVsZSwgJHRpbWVvdXQsICRRSkhlbHBlckZ1bmN0aW9ucykge1xuICAgICRRSkxvZ2dlci5sb2coJ0xvZ2luQ29udHJvbGxlcicpO1xuXG4gICAgJHNjb3BlLmxvZ2lubmFtZVJlcXVpcmVkID0gZmFsc2U7XG4gICAgJHNjb3BlLnBhc3N3b3JkUmVxdWlyZWQgPSBmYWxzZTtcblxuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICRyb290U2NvcGUuZXJyb3IgPSB7XG4gICAgICAgICAgICBtZXNzYWdlOiBcIlwiXG4gICAgICAgIH07XG4gICAgfSwgNDAwMCk7XG5cblxuICAgICRzY29wZS5jbGFzc0ZvclBhc3N3b3JkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiAnZm9ybS1ncm91cCAnICsgKCRzY29wZS5wYXNzd29yZFJlcXVpcmVkID8gJ2hhcy1lcnJvcicgOiAnJyk7XG4gICAgfTtcblxuICAgICRzY29wZS5pbnZhbGlkQ3JlZGVudGlhbHMgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgY29uc29sZS5pbmZvKFwiW1FKYXJ2aXNBcHBMb2dpbkNvbnRyb2xsZXJdLT5bSW52YWxpZENyZWRlbnRpYWxzXVwiKTtcbiAgICAgICAgJHNjb3BlLnNob3dFcnJvcihcIkNyZWRlbmNpYWxlcyBpbnZhbGlkYXNcIik7XG4gICAgfTtcblxuICAgICRzY29wZS5zaG93RXJyb3IgPSBmdW5jdGlvbihlcnJvck1lc3NhZ2UpIHtcbiAgICAgICAgJHJvb3RTY29wZS5lcnJvciA9IHtcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yTWVzc2FnZVxuICAgICAgICB9O1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS5tZXNzYWdlID0gJyc7XG4gICAgICAgIH0sIDUwMDApO1xuICAgIH07XG5cbiAgICAkc2NvcGUudmFsaWRhdGVGaWVsZHMgPSBmdW5jdGlvbihzdWNjZXNzKSB7XG4gICAgICAgIGlmIChfLmlzVW5kZWZpbmVkKCRzY29wZS5sb2dpbm5hbWUpIHx8ICRzY29wZS5sb2dpbm5hbWUgPT0gXCJcIikge1xuICAgICAgICAgICAgY29uc29sZS5pbmZvKFwiW10tPltsb2dpbm5hbWUgcmVxdWlyZWRdXCIpO1xuICAgICAgICAgICAgJHNjb3BlLnNob3dFcnJvcihcIlVzdWFyaW8gcmVxdWVyaWRvXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKF8uaXNVbmRlZmluZWQoJHNjb3BlLnBhc3N3b3JkKSB8fCAkc2NvcGUucGFzc3dvcmQgPT0gXCJcIikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuaW5mbyhcIltdLT5bcGFzc3dvcmQgcmVxdWlyZWRdXCIpO1xuICAgICAgICAgICAgICAgICRzY29wZS5zaG93RXJyb3IoXCJQYXNzd29yZCByZXF1ZXJpZGFcIik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3MoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAkc2NvcGUuc3VibWl0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICRzY29wZS52YWxpZGF0ZUZpZWxkcyhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICRRSkxvZ2luTW9kdWxlLmxvZ2luKCRzY29wZS5sb2dpbm5hbWUsICRzY29wZS5wYXNzd29yZCwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgJFFKSGVscGVyRnVuY3Rpb25zLmNoYW5nZVN0YXRlKCdob21lJyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfTtcbn0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJodFpreDRcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLlxcXFxjb250cm9sbGVyc1xcXFxsb2dpbkN0cmwuanNcIixcIi8uLlxcXFxjb250cm9sbGVyc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBtb2R1bGUgPSByZXF1aXJlKCcuL19tb2R1bGVfaW5pdC5qcycpO1xubW9kdWxlLmNvbnRyb2xsZXIoJ01lbnVMaXN0Q29udHJvbGxlcicsIGZ1bmN0aW9uKFxuICAgICRRSkNDb21ib2JveCwgJFFKQ1NlbGVjdGtleSwgJFFKQ0xpc3R2aWV3LCAkUUpDRmlsdGVyLCAkUUpMb2dnZXIsICRRSkhlbHBlckZ1bmN0aW9ucywgJHNjb3BlLCAkcm9vdFNjb3BlLCAkUUpMb2dpbk1vZHVsZSwgJFFKQXBpLCAkdGltZW91dCwgJHN0YXRlLCAkUUpMb2dpbk1vZHVsZVxuKSB7XG4gICAgJFFKTG9nZ2VyLmxvZyhcIk1lbnVMaXN0Q29udHJvbGxlciAtPiBpbml0aWFsaXplZFwiKTtcblxuXG5cbiAgICAkc2NvcGUuYnJlYWRjcnVtYiA9IHtcbiAgICAgICAgbmFtZTogJ01lbnUgRWRpdG9yJyxcbiAgICAgICAgbGlzdDogW1xuICAgICAgICAgICAgLy97bmFtZTpcIk5vbmUxXCIsc3RhdGU6J21vZHVsZS1wcm9qZWN0LWxpc3QnLGZhOidmYS1kYXNoYm9hcmQnfSxcbiAgICAgICAgICAgIC8ve25hbWU6J05vbmUyJyxzdGF0ZTonJyxmYTonZmEtZGFzaGJvYXJkJ31cbiAgICAgICAgXSxcbiAgICAgICAgYWN0aXZlOiBcIk1lbnUgRWRpdG9yXCJcbiAgICB9O1xuXG4gICAgJHNjb3BlLm1lbnVBcnIgPSBbXTsgLy9ob2xkcyBpdGVtcyBmcm9tIGRiXG4gICAgJHNjb3BlLm1lbnVEYXRhID0gbnVsbDsgLy9ob2xkcyBpdGVtcyBkaXZpZGVkIHBlciBwYWdlXG5cbiAgICAvL2ZpbHRlclxuICAgICRRSkNGaWx0ZXIuY3JlYXRlKHtcbiAgICAgICAgbmFtZTogJ21lbnVGaWx0ZXInLFxuICAgICAgICBmaWVsZHM6IFt7XG4gICAgICAgICAgICBuYW1lOiAnZGVzY3JpcHRpb24nLFxuICAgICAgICAgICAgYXJyYXlOYW1lOiAnbWVudUFycicsXG4gICAgICAgICAgICBiaW5kVG86IFsnZGVzY3JpcHRpb24nXVxuICAgICAgICB9LCB7XG4gICAgICAgICAgICBuYW1lOiAnX3Byb2ZpbGVfaWQnLFxuICAgICAgICAgICAgYXJyYXlOYW1lOiAnbWVudUFycicsXG4gICAgICAgICAgICBiaW5kVG86IFsnX3Byb2ZpbGVfaWQnXVxuICAgICAgICB9LCB7XG4gICAgICAgICAgICBuYW1lOiAnX2dyb3VwX2lkJyxcbiAgICAgICAgICAgIGFycmF5TmFtZTogJ21lbnVBcnInLFxuICAgICAgICAgICAgYmluZFRvOiBbJ19ncm91cF9pZCddXG4gICAgICAgIH1dXG4gICAgfSwgJHNjb3BlKTtcblxuICAgIGZ1bmN0aW9uIGxvYWRDb250cm9scygpIHtcbiAgICAgICAgLy9jb21ib2JveFxuICAgICAgICAkUUpDQ29tYm9ib3guY3JlYXRlKHtcbiAgICAgICAgICAgIG5hbWU6ICdwcm9maWxlQ0JPJyxcbiAgICAgICAgICAgIGxhYmVsOiBcIlByb2ZpbGVcIixcbiAgICAgICAgICAgIGNvZGU6IC0xLFxuICAgICAgICAgICAgY29kZV9jb3B5dG86ICdtZW51RmlsdGVyLmZpZWxkcy5fcHJvZmlsZV9pZCcsXG4gICAgICAgICAgICBhcGk6IHtcbiAgICAgICAgICAgICAgICBjb250cm9sbGVyOiAncHJvZmlsZScsXG4gICAgICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbjogJ2NvbWJvYm94X2FsbCdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LCAkc2NvcGUpO1xuICAgICAgICAvL2NvbWJvYm94XG4gICAgICAgICRRSkNDb21ib2JveC5jcmVhdGUoe1xuICAgICAgICAgICAgbmFtZTogJ2dyb3VwQ0JPJyxcbiAgICAgICAgICAgIGxhYmVsOiBcIkltcGxlbWVudGF0aW9uIGdyb3VwXCIsXG4gICAgICAgICAgICBjb2RlOiAtMSxcbiAgICAgICAgICAgIGNvZGVfY29weXRvOiAnbWVudUZpbHRlci5maWVsZHMuX2dyb3VwX2lkJyxcbiAgICAgICAgICAgIGFwaToge1xuICAgICAgICAgICAgICAgIGNvbnRyb2xsZXI6ICdncm91cCcsXG4gICAgICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbjogJ2NvbWJvYm94X2FsbCdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LCAkc2NvcGUpO1xuICAgICAgICAvL2xpc3R2aWV3XG4gICAgICAgICRRSkNMaXN0dmlldy5jcmVhdGUoe1xuICAgICAgICAgICAgbmFtZTogJ21lbnVMVlcnLFxuICAgICAgICAgICAgZGF0YUFycmF5OiAnbWVudUFycicsXG4gICAgICAgICAgICBwYWdlZERhdGFBcnJheTogJ21lbnVEYXRhJyxcbiAgICAgICAgICAgIGFwaToge1xuICAgICAgICAgICAgICAgIGNvbnRyb2xsZXI6ICdtZW51JyxcbiAgICAgICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiAnY29tYm9ib3hfYWxsJ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjb2x1bW5zOiBbe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiAnZGVzY3JpcHRpb24nLFxuICAgICAgICAgICAgICAgICAgICBsYWJlbDogJ0Rlc2NyaXB0aW9uJ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvL3tuYW1lOidmaXJzdF9uYW1lJyxsYWJlbDonRmlyc3QgbmFtZSd9LFxuICAgICAgICAgICAgICAgIC8ve25hbWU6J19wcm9maWxlX2lkJyxsYWJlbDonTGFzdCBuYW1lJ31cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBpdGVtQ2xpY2s6IGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgICAgICAgICAgICAkUUpIZWxwZXJGdW5jdGlvbnMuY2hhbmdlU3RhdGUoJ21vZHVsZS1tZW51LWVkaXQnLCB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBpdGVtLl9pZFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCAkc2NvcGUpO1xuICAgIH1cblxuXG4gICAgLy9Mb2FkIGNvbnRyb2xzIHdoZW4gY3VycmVudCBpdGVtIGl0cyBhdmFsaWFibGUuXG4gICAgdmFyIGNvbnRyb2xzTG9hZGVkID0gZmFsc2U7XG4gICAgJHJvb3RTY29wZS4kb24oJ2N1cnJlbnRVc2VyLmNoYW5nZScsIGZ1bmN0aW9uKCkge1xuICAgICAgICBsb2FkQ29udHJvbHMoKTtcbiAgICAgICAgY29udHJvbHNMb2FkZWQgPSB0cnVlO1xuICAgIH0pO1xuICAgIGlmICghY29udHJvbHNMb2FkZWQgJiYgIV8uaXNVbmRlZmluZWQoJHJvb3RTY29wZS5jdXJyZW50VXNlcikpIHtcbiAgICAgICAgbG9hZENvbnRyb2xzKCk7XG4gICAgICAgIGNvbnRyb2xzTG9hZGVkID0gdHJ1ZTtcbiAgICB9XG4gICAgLy9kZWZhdWx0c1xuICAgICR0aW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAkc2NvcGUubWVudUZpbHRlci5maWx0ZXIoKTtcbiAgICB9LCAyMDAwKTtcbn0pXG5cblxuXG5tb2R1bGUuY29udHJvbGxlcignTWVudUVkaXRDb250cm9sbGVyJywgZnVuY3Rpb24oXG4gICAgJFFKQ0NvbWJvYm94LCAkUUpMb2dnZXIsICRRSkhlbHBlckZ1bmN0aW9ucywgJHNjb3BlLCAkcm9vdFNjb3BlLCAkUUpMb2dpbk1vZHVsZSwgJFFKQXBpLCAkdGltZW91dCwgJHN0YXRlLCAkUUpMb2dpbk1vZHVsZVxuKSB7XG4gICAgJFFKTG9nZ2VyLmxvZyhcIk1lbnVFZGl0Q29udHJvbGxlciAtPiBpbml0aWFsaXplZFwiKTtcblxuICAgIHZhciBfbWVudV9pZCA9ICRzdGF0ZS5wYXJhbXMuaWQ7XG5cbiAgICAkc2NvcGUuY3J1ZCA9IHtcbiAgICAgICAgZXJyb3JzOiBbXVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNob3dFcnJvcihlcnJvcikge1xuICAgICAgICAkc2NvcGUuY3J1ZC5lcnJvcnMucHVzaChlcnJvcik7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZvcm1IYXNFcnJvcnMoKSB7XG4gICAgICAgICRzY29wZS5jcnVkLmVycm9ycyA9IFtdO1xuICAgICAgICB2YXIgaGFzRXJyb3JzID0gZmFsc2U7XG4gICAgICAgIGlmIChfLmlzVW5kZWZpbmVkKCRzY29wZS5pdGVtLmRlc2NyaXB0aW9uKSB8fCAkc2NvcGUuaXRlbS5kZXNjcmlwdGlvbiA9PSAnJykge1xuICAgICAgICAgICAgaGFzRXJyb3JzID0gc2hvd0Vycm9yKCdEZXNjcmlwdGlvbiByZXF1aXJlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChfLmlzVW5kZWZpbmVkKCRzY29wZS5pdGVtLl9ncm91cF9pZCkgfHwgJHNjb3BlLml0ZW0uX2dyb3VwX2lkID09ICcnKSB7XG4gICAgICAgICAgICBoYXNFcnJvcnMgPSBzaG93RXJyb3IoJ0dyb3VwIHJlcXVpcmVkJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKF8uaXNVbmRlZmluZWQoJHNjb3BlLml0ZW0uX3Byb2ZpbGVfaWQpIHx8ICRzY29wZS5pdGVtLl9wcm9maWxlX2lkID09ICcnKSB7XG4gICAgICAgICAgICBoYXNFcnJvcnMgPSBzaG93RXJyb3IoJ1Byb2ZpbGUgcmVxdWlyZWQnKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaGFzRXJyb3JzO1xuICAgIH1cblxuICAgICRzY29wZS5zYXZlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICghZm9ybUhhc0Vycm9ycygpKSB7XG4gICAgICAgICAgICAkUUpBcGkuZ2V0Q29udHJvbGxlcignbWVudScpLnBvc3Qoe1xuICAgICAgICAgICAgICAgIGFjdGlvbjogJ3NhdmUnXG4gICAgICAgICAgICB9LCAkc2NvcGUuaXRlbSwgZnVuY3Rpb24ocmVzKSB7XG4gICAgICAgICAgICAgICAgJFFKTG9nZ2VyLmxvZyhcIk1lbnVFZGl0Q29udHJvbGxlciAtPiBhcGkgcG9zdCAtPiBtZW51IHNhdmUgLT4gc3VjY2Vzc1wiKTtcbiAgICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAgIHNob3dFcnJvcignQ2FtYmlvcyBndWFyZGFkb3MnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuICAgIH07XG4gICAgJHNjb3BlLmNhbmNlbCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAkUUpIZWxwZXJGdW5jdGlvbnMuY2hhbmdlU3RhdGUoJ21vZHVsZS1tZW51LWxpc3QnKTtcbiAgICB9O1xuXG5cbiAgICBmdW5jdGlvbiBsb2FkQ29udHJvbHMoKSB7XG4gICAgICAgIC8vY29tYm9ib3hcbiAgICAgICAgJFFKQ0NvbWJvYm94LmNyZWF0ZSh7XG4gICAgICAgICAgICBuYW1lOiAnZ3JvdXBDQk8nLFxuICAgICAgICAgICAgbGFiZWw6IFwiSW1wbGVtZW50YXRpb24gZ3JvdXBcIixcbiAgICAgICAgICAgIGNvZGU6ICRzY29wZS5pdGVtLl9ncm91cF9pZCxcbiAgICAgICAgICAgIGNvZGVfY29weXRvOiAnaXRlbS5fZ3JvdXBfaWQnLFxuICAgICAgICAgICAgYXBpOiB7XG4gICAgICAgICAgICAgICAgY29udHJvbGxlcjogJ2dyb3VwJyxcbiAgICAgICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiAnY29tYm9ib3hfYWxsJ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sICRzY29wZSk7XG4gICAgICAgIC8vY29tYm9ib3hcbiAgICAgICAgJFFKQ0NvbWJvYm94LmNyZWF0ZSh7XG4gICAgICAgICAgICBuYW1lOiAncHJvZmlsZUNCTycsXG4gICAgICAgICAgICBsYWJlbDogXCJQcm9maWxlXCIsXG4gICAgICAgICAgICBjb2RlOiAkc2NvcGUuaXRlbS5fcHJvZmlsZV9pZCxcbiAgICAgICAgICAgIGNvZGVfY29weXRvOiAnaXRlbS5fcHJvZmlsZV9pZCcsXG4gICAgICAgICAgICBhcGk6IHtcbiAgICAgICAgICAgICAgICBjb250cm9sbGVyOiAncHJvZmlsZScsXG4gICAgICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbjogJ2NvbWJvYm94X2FsbCdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LCAkc2NvcGUpO1xuICAgIH1cblxuXG5cbiAgICAvL0dFVCBTSU5HTEUgVVNFUlxuICAgICRRSkFwaS5nZXRDb250cm9sbGVyKCdtZW51JykuZ2V0KHtcbiAgICAgICAgYWN0aW9uOiAnc2luZ2xlJyxcbiAgICAgICAgaWQ6IF9tZW51X2lkXG4gICAgfSwgZnVuY3Rpb24ocmVzKSB7XG4gICAgICAgICRRSkxvZ2dlci5sb2coXCJNZW51RWRpdENvbnRyb2xsZXIgLT4gYXBpIGdldCAtPiBtZW51IHNpbmdsZSAtPiBzdWNjZXNzXCIpO1xuICAgICAgICAkc2NvcGUuaXRlbSA9IHJlcy5pdGVtc1swXSB8fCBudWxsO1xuICAgICAgICBsb2FkQ29udHJvbHMoKTtcbiAgICB9KTtcblxuXG59KTtcblxuXG47XG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uXFxcXGNvbnRyb2xsZXJzXFxcXG1vZC5tZW51Q3RybC5qc1wiLFwiLy4uXFxcXGNvbnRyb2xsZXJzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIG1vZHVsZSA9IHJlcXVpcmUoJy4vX21vZHVsZV9pbml0LmpzJyk7XG5cblxuXG5cbm1vZHVsZS5jb250cm9sbGVyKCdQcm9maWxlTGlzdENvbnRyb2xsZXInLCBmdW5jdGlvbihcblx0JFFKQ0NvbWJvYm94LCAkUUpDTGlzdHZpZXcsICRRSkNGaWx0ZXIsICRRSkxvZ2dlciwgJFFKSGVscGVyRnVuY3Rpb25zLCAkc2NvcGUsICRyb290U2NvcGUsICRRSkxvZ2luTW9kdWxlLCAkUUpBcGksICR0aW1lb3V0LCAkc3RhdGUsICRRSkxvZ2luTW9kdWxlXG4pIHtcblxuXHQkUUpMb2dnZXIubG9nKFwiUHJvZmlsZUxpc3RDb250cm9sbGVyIC0+IGluaXRpYWxpemVkXCIpO1xuXHQkc2NvcGUuYnJlYWRjcnVtYiA9IHtcblx0XHRuYW1lOiAnUHJvZmlsZXMnLFxuXHRcdGxpc3Q6IFtdLFxuXHRcdGFjdGl2ZTogXCJQcm9maWxlc1wiXG5cdH07XG5cdCRzY29wZS5pdGVtcyA9IFtdOyAvL2hvbGRzIGl0ZW1zIGZyb20gZGJcblx0JHNjb3BlLmx2d0RhdGEgPSBudWxsOyAvL2hvbGRzIGl0ZW1zIGRpdmlkZWQgcGVyIHBhZ2VcblxuXHQvL2ZpbHRlclxuXHQkUUpDRmlsdGVyLmNyZWF0ZSh7XG5cdFx0bmFtZTogJ2ZpbHRlcicsXG5cdFx0ZmllbGRzOiBbe1xuXHRcdFx0bmFtZTogJ2Rlc2NyaXB0aW9uJyxcblx0XHRcdGFycmF5TmFtZTogJ2l0ZW1zJyxcblx0XHRcdGJpbmRUbzogWydkZXNjcmlwdGlvbiddXG5cdFx0fV1cblx0fSwgJHNjb3BlKTtcblxuXHRmdW5jdGlvbiBsb2FkQ29udHJvbHMoKSB7XG5cdFx0Ly9saXN0dmlld1xuXHRcdCRRSkNMaXN0dmlldy5jcmVhdGUoe1xuXHRcdFx0bmFtZTogJ2x2dycsXG5cdFx0XHRkYXRhQXJyYXk6ICdpdGVtcycsXG5cdFx0XHRwYWdlZERhdGFBcnJheTogJ2x2d0RhdGEnLFxuXHRcdFx0YXBpOiB7XG5cdFx0XHRcdGNvbnRyb2xsZXI6ICdwcm9maWxlJyxcblx0XHRcdFx0cGFyYW1zOiB7XG5cdFx0XHRcdFx0YWN0aW9uOiAnY29tYm9ib3hfYWxsJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Y29sdW1uczogW3tcblx0XHRcdFx0bmFtZTogJ2Rlc2NyaXB0aW9uJyxcblx0XHRcdFx0bGFiZWw6ICdEZXNjcmlwdGlvbidcblx0XHRcdH1dLFxuXHRcdFx0aXRlbUNsaWNrOiBmdW5jdGlvbihpdGVtKSB7XG5cdFx0XHRcdCRRSkhlbHBlckZ1bmN0aW9ucy5jaGFuZ2VTdGF0ZSgnbW9kdWxlLXByb2ZpbGUtZWRpdCcsIHtcblx0XHRcdFx0XHRpZDogaXRlbS5faWRcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSwgJHNjb3BlKTtcblx0fVxuXG5cblx0Ly9Mb2FkIGNvbnRyb2xzIHdoZW4gY3VycmVudCBpdGVtIGl0cyBhdmFsaWFibGUuXG5cdHZhciBjb250cm9sc0xvYWRlZCA9IGZhbHNlO1xuXHQkcm9vdFNjb3BlLiRvbignY3VycmVudFVzZXIuY2hhbmdlJywgZnVuY3Rpb24oKSB7XG5cdFx0bG9hZENvbnRyb2xzKCk7XG5cdFx0Y29udHJvbHNMb2FkZWQgPSB0cnVlO1xuXHR9KTtcblx0aWYgKCFjb250cm9sc0xvYWRlZCAmJiAhXy5pc1VuZGVmaW5lZCgkcm9vdFNjb3BlLmN1cnJlbnRVc2VyKSkge1xuXHRcdGxvYWRDb250cm9scygpO1xuXHRcdGNvbnRyb2xzTG9hZGVkID0gdHJ1ZTtcblx0fVxuXHQvL2RlZmF1bHRzXG5cdCR0aW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdCRzY29wZS5maWx0ZXIuZmlsdGVyKCk7XG5cdH0sIDIwMDApO1xufSlcblxubW9kdWxlLmNvbnRyb2xsZXIoJ1Byb2ZpbGVFZGl0Q29udHJvbGxlcicsIGZ1bmN0aW9uKFxuXHQkUUpDQ29tYm9ib3gsICRRSkNTZWxlY3RrZXksICRRSkNMaXN0dmlldywgJFFKQ0ZpbHRlciwgJFFKTG9nZ2VyLCAkUUpIZWxwZXJGdW5jdGlvbnMsICRzY29wZSwgJHJvb3RTY29wZSwgJFFKTG9naW5Nb2R1bGUsICRRSkFwaSwgJHRpbWVvdXQsICRzdGF0ZSwgJFFKTG9naW5Nb2R1bGVcbikge1xuXHQkc2NvcGUuaWQgPSAkc3RhdGUucGFyYW1zLmlkO1xuXHR2YXIgX2lkID0gJHN0YXRlLnBhcmFtcy5pZDtcblx0dmFyIGFjdGlvbiA9ICgoX2lkLnRvU3RyaW5nKCkgPT09ICctMScpPydOZXcnOidFZGl0Jyk7XG5cdCRRSkxvZ2dlci5sb2coXCJQcm9maWxlRWRpdENvbnRyb2xsZXIgLT4gaW5pdGlhbGl6ZWRcIik7XG5cdCRzY29wZS5icmVhZGNydW1iID0ge1xuXHRcdG5hbWU6ICdQcm9maWxlICcrYWN0aW9uLFxuXHRcdGxpc3Q6IFt7XG5cdFx0XHRuYW1lOiBcIlByb2ZpbGVzXCIsXG5cdFx0XHRzdGF0ZTogJ21vZHVsZS1wcm9maWxlLWxpc3QnLFxuXHRcdFx0Ly9mYTogJ2ZhLWRhc2hib2FyZCdcblx0XHR9LCBdLFxuXHRcdGFjdGl2ZTogYWN0aW9uXG5cdH07XG5cblx0JHNjb3BlLmVuYWJsZURlbGV0ZSA9IGZ1bmN0aW9uKCl7XG5cdFx0cmV0dXJuICRzY29wZS5pZCAmJiAkc2NvcGUuaWQudG9TdHJpbmcoKSAhPSAnLTEnO1xuXHR9O1xuXG5cdFxuXG5cdCRzY29wZS5jcnVkID0ge1xuXHRcdGVycm9yczogW11cblx0fVxuXG5cdGZ1bmN0aW9uIHNob3dFcnJvcihlcnJvcikge1xuXHRcdCRzY29wZS5jcnVkLmVycm9ycy5wdXNoKGVycm9yKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGZvcm1IYXNFcnJvcnMoKSB7XG5cdFx0JHNjb3BlLmNydWQuZXJyb3JzID0gW107XG5cdFx0dmFyIGhhc0Vycm9ycyA9IGZhbHNlO1xuXHRcdGlmIChfLmlzVW5kZWZpbmVkKCRzY29wZS5pdGVtLmRlc2NyaXB0aW9uKSB8fCAkc2NvcGUuaXRlbS5kZXNjcmlwdGlvbiA9PSAnJykge1xuXHRcdFx0aGFzRXJyb3JzID0gc2hvd0Vycm9yKCdEZXNjcmlwdGlvbiByZXF1aXJlZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gaGFzRXJyb3JzO1xuXHR9XG5cblx0JHNjb3BlLnNhdmUgPSBmdW5jdGlvbigpIHtcblx0XHRpZiAoIWZvcm1IYXNFcnJvcnMoKSkge1xuXHRcdFx0JFFKQXBpLmdldENvbnRyb2xsZXIoJ3Byb2ZpbGUnKS5wb3N0KHtcblx0XHRcdFx0YWN0aW9uOiAnc2F2ZSdcblx0XHRcdH0sICRzY29wZS5pdGVtLCBmdW5jdGlvbihyZXMpIHtcblx0XHRcdFx0JFFKTG9nZ2VyLmxvZyhcIlByb2ZpbGVFZGl0Q29udHJvbGxlciAtPiBhcGkgcG9zdCAtPiBzYXZlIC0+IHN1Y2Nlc3NcIik7XG5cdFx0XHRcdC8vXG5cdFx0XHRcdHNob3dFcnJvcignQ2FtYmlvcyBndWFyZGFkb3MnKTtcblx0XHRcdFx0JFFKSGVscGVyRnVuY3Rpb25zLmNoYW5nZVN0YXRlKCdtb2R1bGUtcHJvZmlsZS1saXN0Jyx7fSw1MDApO1xuXHRcdFx0fSk7XG5cdFx0fTtcblx0fTtcblx0JHNjb3BlLmRlbGV0ZSA9IGZ1bmN0aW9uKCkge1xuXHRcdHZhciByID0gY29uZmlybShcIkRlbGV0ZSBcIiArICRzY29wZS5pdGVtLmRlc2NyaXB0aW9uICsgXCIgP1wiKTtcblx0XHRpZiAociA9PSB0cnVlKSB7XG5cdFx0XHQkUUpBcGkuZ2V0Q29udHJvbGxlcigncHJvZmlsZScpLnBvc3Qoe1xuXHRcdFx0XHRhY3Rpb246ICdkZWxldGUnXG5cdFx0XHR9LCAkc2NvcGUuaXRlbSwgZnVuY3Rpb24ocmVzKSB7XG5cdFx0XHRcdCRRSkxvZ2dlci5sb2coXCJQcm9maWxlRWRpdENvbnRyb2xsZXIgLT4gZGVsZXRlIC0+IHN1Y2Nlc3NcIik7XG5cdFx0XHRcdC8vXG5cdFx0XHRcdHNob3dFcnJvcignQ2FtYmlvcyBndWFyZGFkb3MnKTtcblx0XHRcdFx0c2hvd0Vycm9yKCRzY29wZS5pdGVtLmRlc2NyaXB0aW9uICsgJyBlbGltaW5hZG8nKTtcblx0XHRcdFx0Ly9cblx0XHRcdFx0JFFKSGVscGVyRnVuY3Rpb25zLmNoYW5nZVN0YXRlKCdtb2R1bGUtcHJvZmlsZS1saXN0Jyx7fSw1MDApO1xuXG5cdFx0XHRcdGNyZWF0ZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHt9XG5cdH1cblx0JHNjb3BlLmNhbmNlbCA9IGZ1bmN0aW9uKCkge1xuXHRcdCRRSkhlbHBlckZ1bmN0aW9ucy5jaGFuZ2VTdGF0ZSgnbW9kdWxlLXByb2ZpbGUtbGlzdCcpO1xuXHR9O1xuXG5cdGZ1bmN0aW9uIGxvYWRDb250cm9scygpIHt9XG5cblx0ZnVuY3Rpb24gY3JlYXRlKCkge1xuXHRcdCRRSkxvZ2dlci5sb2coXCJQcm9maWxlRWRpdENvbnRyb2xsZXIgLT4gY3JlYXRlIG5ldyFcIik7XG5cdFx0JHNjb3BlLml0ZW0gPSB7XG5cdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRfaWQ6IC0xXG5cdFx0fTtcblx0fVxuXHRpZiAoX2lkID09IC0xKSB7XG5cdFx0Ly9DUkVBVEVcblx0XHRjcmVhdGUoKTtcblx0XHRsb2FkQ29udHJvbHMoKTtcblx0fSBlbHNlIHtcblx0XHQvL0dFVCBTSU5HTEUgVVNFUlxuXHRcdCRRSkFwaS5nZXRDb250cm9sbGVyKCdwcm9maWxlJykuZ2V0KHtcblx0XHRcdGFjdGlvbjogJ3NpbmdsZScsXG5cdFx0XHRpZDogX2lkXG5cdFx0fSwgZnVuY3Rpb24ocmVzKSB7XG5cdFx0XHQkUUpMb2dnZXIubG9nKFwiUHJvZmlsZUVkaXRDb250cm9sbGVyIC0+IGFwaSBnZXQgLT4gc2luZ2xlIC0+IHN1Y2Nlc3NcIik7XG5cdFx0XHQkc2NvcGUuaXRlbSA9IHJlcy5pdGVtO1xuXHRcdFx0JHNjb3BlLmJyZWFkY3J1bWIuYWN0aXZlID0gJHNjb3BlLml0ZW0uZGVzY3JpcHRpb247XG5cdFx0XHRsb2FkQ29udHJvbHMoKTtcblx0XHR9KTtcblx0fVxuXG59KTtcblxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uXFxcXGNvbnRyb2xsZXJzXFxcXG1vZC5wcm9maWxlQ3RybC5qc1wiLFwiLy4uXFxcXGNvbnRyb2xsZXJzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIG1vZHVsZSA9IHJlcXVpcmUoJy4vX21vZHVsZV9pbml0LmpzJyk7XG5tb2R1bGUuY29udHJvbGxlcignUHJvamVjdEhvdXJzTGlzdENvbnRyb2xsZXInLCBmdW5jdGlvbihcbiAgICAkUUpMb2NhbFNlc3Npb24sICRRSkNUaW1lQ291bnRlciwgJGludGVydmFsLCAkUUpDQ29tYm9ib3gsICRRSkNTZWxlY3RrZXksICRRSkNMaXN0dmlldywgJFFKQ0ZpbHRlciwgJFFKTG9nZ2VyLCAkUUpIZWxwZXJGdW5jdGlvbnMsICRzY29wZSwgJHJvb3RTY29wZSwgJFFKTG9naW5Nb2R1bGUsICRRSkFwaSwgJHRpbWVvdXQsICRzdGF0ZSwgJFFKTG9naW5Nb2R1bGVcbikge1xuICAgICRRSkxvZ2dlci5sb2coXCJQcm9qZWN0TGlzdENvbnRyb2xsZXIgLT4gaW5pdGlhbGl6ZWRcIik7XG5cblxuICAgICRzY29wZS5icmVhZGNydW1iID0ge1xuICAgICAgICBuYW1lOiAnUHJvamVjdHMgSG91cnMnLFxuICAgICAgICBsaXN0OiBbe1xuICAgICAgICAgICAgbmFtZTogJ1Byb2plY3RzJyxcbiAgICAgICAgICAgIHN0YXRlOiAnbW9kdWxlLXByb2plY3QtbGlzdCcsXG4gICAgICAgICAgICAvL2ZhOiAnZmEtZGFzaGJvYXJkJ1xuICAgICAgICB9XSxcbiAgICAgICAgYWN0aXZlOiBcIlByb2plY3RzIEhvdXJzXCJcbiAgICB9O1xuXG5cbiAgICBnLlByb2plY3RMaXN0Q29udHJvbGxlciA9ICRzY29wZTtcblxuICAgICRzY29wZS5pdGVtcyA9IFtdOyAvL2hvbGRzIHByb2plY3RzIGZyb20gZGJcbiAgICAkc2NvcGUuaXRlbXNEYXRhID0gbnVsbDsgLy9ob2xkcyBwcm9qZWN0cyBkaXZpZGVkIHBlciBwYWdlXG5cbiAgICAvL2ZpbHRlclxuICAgICRRSkNGaWx0ZXIuY3JlYXRlKHtcbiAgICAgICAgbmFtZTogJ3Byb2plY3Rob3Vyc0ZpbHRlcicsXG4gICAgICAgIGZpZWxkczogW3tcbiAgICAgICAgICAgIG5hbWU6ICdsb2dpbm5hbWUnLFxuICAgICAgICAgICAgYXJyYXlOYW1lOiAnaXRlbXMnLFxuICAgICAgICAgICAgYmluZFRvOiBbJ2xvZ2lubmFtZSddXG4gICAgICAgIH0sIHtcbiAgICAgICAgICAgIG5hbWU6ICdfaWRfY29tcGFueScsXG4gICAgICAgICAgICBhcnJheU5hbWU6ICdpdGVtcycsXG4gICAgICAgICAgICBiaW5kVG86IFsnX2lkX2NvbXBhbnknXVxuICAgICAgICB9LCB7XG4gICAgICAgICAgICBuYW1lOiAnX2lkX3Byb2plY3QnLFxuICAgICAgICAgICAgYXJyYXlOYW1lOiAnaXRlbXMnLFxuICAgICAgICAgICAgYmluZFRvOiBbJ19pZF9wcm9qZWN0J11cbiAgICAgICAgfSwge1xuICAgICAgICAgICAgbmFtZTogJ19pZF91c2VyJyxcbiAgICAgICAgICAgIGFycmF5TmFtZTogJ2l0ZW1zJyxcbiAgICAgICAgICAgIGJpbmRUbzogWydfaWRfdXNlciddXG4gICAgICAgIH1dXG4gICAgfSwgJHNjb3BlKTtcblxuXG4gICAgZnVuY3Rpb24gbG9hZENvbnRyb2xzKCkge1xuXG4gICAgICAgIC8vLS0tLS0tLS1cbiAgICAgICAgLy9jb21ib2JveFxuICAgICAgICAkUUpDQ29tYm9ib3guY3JlYXRlKHtcbiAgICAgICAgICAgIG5hbWU6ICdob3Vyc2NvbXBhbnlDQk8nLFxuICAgICAgICAgICAgbGFiZWw6IFwiQ29tcGFueVwiLFxuICAgICAgICAgICAgY29kZTogJHJvb3RTY29wZS5zZXNzaW9uLnByb2plY3Rob3Vyc19ob3Vyc2NvbXBhbnlDQk9DT0RFIHx8IC0xLCAvLyRyb290U2NvcGUuY3VycmVudFVzZXIuX2dyb3VwX2lkLFxuICAgICAgICAgICAgY29kZV9jb3B5dG86ICdob3Vyc3Byb2plY3RDQk8uYXBpLnBhcmFtcy5faWRfY29tcGFueScsXG4gICAgICAgICAgICAvL2Rlc2NyaXB0aW9uX2NvcHl0bzogJ2N1cnJlbnQuY29tcGFueScsXG4gICAgICAgICAgICBhcGk6IHtcbiAgICAgICAgICAgICAgICBjb250cm9sbGVyOiAnY29tcGFueScsXG4gICAgICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbjogJ2NvbWJvYm94X2FsbCdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LCAkc2NvcGUpO1xuICAgICAgICAvL2NvbWJvYm94XG4gICAgICAgICRRSkNDb21ib2JveC5jcmVhdGUoe1xuICAgICAgICAgICAgbmFtZTogJ2hvdXJzcHJvamVjdENCTycsXG4gICAgICAgICAgICBsYWJlbDogXCJQcm9qZWN0XCIsXG4gICAgICAgICAgICBjb2RlOiAkcm9vdFNjb3BlLnNlc3Npb24ucHJvamVjdGhvdXJzX2hvdXJzcHJvamVjdENCT0NPREUgfHwgLTEsIC8vJHJvb3RTY29wZS5jdXJyZW50VXNlci5fZ3JvdXBfaWQsXG4gICAgICAgICAgICBjb2RlX2NvcHl0bzogJ2N1cnJlbnQuaXRlbS5faWRfcHJvamVjdCcsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbl9jb3B5dG86ICdjdXJyZW50LnByb2plY3QnLFxuICAgICAgICAgICAgYXBpOiB7XG4gICAgICAgICAgICAgICAgY29udHJvbGxlcjogJ3Byb2plY3QnLFxuICAgICAgICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb246ICdjb21ib2JveF9hbGwnLFxuICAgICAgICAgICAgICAgICAgICBfaWRfY29tcGFueTogJHNjb3BlLmhvdXJzY29tcGFueUNCTy5jb2RlIHx8IC0xXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSwgJHNjb3BlKVxuICAgICAgICAvLy0tLS0tLS0tXG5cblxuICAgICAgICAvL2NvbWJvYm94XG4gICAgICAgICRRSkNDb21ib2JveC5jcmVhdGUoe1xuICAgICAgICAgICAgbmFtZTogJ2NvbXBhbnlDQk8nLFxuICAgICAgICAgICAgbGFiZWw6IFwiQ29tcGFueVwiLFxuICAgICAgICAgICAgY29kZTogLTEsIC8vJHJvb3RTY29wZS5jdXJyZW50VXNlci5fZ3JvdXBfaWQsXG4gICAgICAgICAgICBjb2RlX2NvcHl0bzogJ3Byb2plY3Rob3Vyc0ZpbHRlci5maWVsZHMuX2lkX2NvbXBhbnknLFxuICAgICAgICAgICAgYXBpOiB7XG4gICAgICAgICAgICAgICAgY29udHJvbGxlcjogJ2NvbXBhbnknLFxuICAgICAgICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb246ICdjb21ib2JveF9hbGwnXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSwgJHNjb3BlKTtcbiAgICAgICAgLy9jb21ib2JveFxuICAgICAgICAkUUpDQ29tYm9ib3guY3JlYXRlKHtcbiAgICAgICAgICAgIG5hbWU6ICdwcm9qZWN0Q0JPJyxcbiAgICAgICAgICAgIGxhYmVsOiBcIlByb2plY3RcIixcbiAgICAgICAgICAgIGNvZGU6IC0xLCAvLyRyb290U2NvcGUuY3VycmVudFVzZXIuX2dyb3VwX2lkLFxuICAgICAgICAgICAgY29kZV9jb3B5dG86ICdwcm9qZWN0aG91cnNGaWx0ZXIuZmllbGRzLl9pZF9wcm9qZWN0JyxcbiAgICAgICAgICAgIGFwaToge1xuICAgICAgICAgICAgICAgIGNvbnRyb2xsZXI6ICdwcm9qZWN0JyxcbiAgICAgICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiAnY29tYm9ib3hfYWxsJ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sICRzY29wZSk7XG4gICAgICAgIC8vY29tYm9ib3hcbiAgICAgICAgJFFKQ0NvbWJvYm94LmNyZWF0ZSh7XG4gICAgICAgICAgICBuYW1lOiAndXNlckNCTycsXG4gICAgICAgICAgICBsYWJlbDogXCJVc2VyXCIsXG4gICAgICAgICAgICBjb2RlOiAtMSwgLy8kcm9vdFNjb3BlLmN1cnJlbnRVc2VyLl9ncm91cF9pZCxcbiAgICAgICAgICAgIGNvZGVfY29weXRvOiAncHJvamVjdGhvdXJzRmlsdGVyLmZpZWxkcy5faWRfdXNlcicsXG4gICAgICAgICAgICBhcGk6IHtcbiAgICAgICAgICAgICAgICBjb250cm9sbGVyOiAndXNlcicsXG4gICAgICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbjogJ2NvbWJvYm94X2FsbCdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LCAkc2NvcGUpO1xuXG5cblxuICAgICAgICAvL2xpc3R2aWV3XG4gICAgICAgICRRSkNMaXN0dmlldy5jcmVhdGUoe1xuICAgICAgICAgICAgbmFtZTogJ3Byb2plY3RzaG91cnNMVlcnLFxuICAgICAgICAgICAgZGF0YUFycmF5OiAnaXRlbXMnLFxuICAgICAgICAgICAgcGFnZWREYXRhQXJyYXk6ICdpdGVtc0RhdGEnLFxuICAgICAgICAgICAgYXBpOiB7XG4gICAgICAgICAgICAgICAgY29udHJvbGxlcjogJ3Byb2plY3QnLFxuICAgICAgICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb246ICdob3Vyc19hbGwnLFxuICAgICAgICAgICAgICAgICAgICBfaWRfcHJvamVjdDogLTFcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY29sdW1uczogW3tcbiAgICAgICAgICAgICAgICBuYW1lOiAnbG9naW5uYW1lJyxcbiAgICAgICAgICAgICAgICBsYWJlbDogJ1VzZXInXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2RpZmZlcmVuY2VGb3JtYXRlZCcsXG4gICAgICAgICAgICAgICAgbGFiZWw6ICdUaWVtcG8gKGhtcyknXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3N0YXJ0Rm9ybWF0ZWQnLFxuICAgICAgICAgICAgICAgIGxhYmVsOiAnU3RhcnQnXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2VuZEZvcm1hdGVkJyxcbiAgICAgICAgICAgICAgICBsYWJlbDogJ0VuZCdcbiAgICAgICAgICAgIH1dLFxuICAgICAgICAgICAgaXRlbUNsaWNrOiBmdW5jdGlvbihpdGVtKSB7XG4gICAgICAgICAgICAgICAgJFFKSGVscGVyRnVuY3Rpb25zLmNoYW5nZVN0YXRlKCdtb2R1bGUtcHJvamVjdC1ob3Vycy1lZGl0Jywge1xuICAgICAgICAgICAgICAgICAgICBpZDogaXRlbS5faWRcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgJHNjb3BlKTtcblxuICAgICAgICAkc2NvcGUuJG9uKFwicHJvamVjdHNob3Vyc0xWVy51cGRhdGVcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUuaW5mbyhcInByb2plY3RzaG91cnNMVlcudXBkYXRlXCIpO1xuICAgICAgICAgICAgJHNjb3BlLml0ZW1zID0gXy5lYWNoKCRzY29wZS5pdGVtcywgZnVuY3Rpb24oaXRlbSkge1xuICAgICAgICAgICAgICAgIHZhciBkaWZmID0gaXRlbS5kaWZmZXJlbmNlO1xuICAgICAgICAgICAgICAgIHZhciBkdXJhdGlvbiA9IHtcbiAgICAgICAgICAgICAgICAgICAgaG91cnM6IE1hdGgucm91bmQoKGRpZmYgLyAxMDAwIC8gNjAgLyA2MCkgJSAyNCksXG4gICAgICAgICAgICAgICAgICAgIG1pbnV0ZXM6IE1hdGgucm91bmQoKGRpZmYgLyAxMDAwIC8gNjApICUgNjApLFxuICAgICAgICAgICAgICAgICAgICBzZWNvbmRzOiBNYXRoLnJvdW5kKChkaWZmIC8gMTAwMCkgJSA2MClcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHZhciBzdHIgPSBcIlwiO1xuICAgICAgICAgICAgICAgIHN0ciArPSBkdXJhdGlvbi5ob3VycyArIFwiOlwiO1xuICAgICAgICAgICAgICAgIHN0ciArPSBkdXJhdGlvbi5taW51dGVzICsgXCI6XCI7XG4gICAgICAgICAgICAgICAgc3RyICs9IGR1cmF0aW9uLnNlY29uZHMgKyBcIlwiO1xuICAgICAgICAgICAgICAgIGl0ZW0uZGlmZmVyZW5jZUZvcm1hdGVkID0gc3RyO1xuICAgICAgICAgICAgICAgIGl0ZW0uc3RhcnRGb3JtYXRlZCA9IG1vbWVudChwYXJzZUludChpdGVtLnN0YXJ0KSkuZm9ybWF0KFwiREQtTU0tWVkgaDptbTpzcyBhXCIpO1xuICAgICAgICAgICAgICAgIGl0ZW0uZW5kRm9ybWF0ZWQgPSBtb21lbnQocGFyc2VJbnQoaXRlbS5lbmQpKS5mb3JtYXQoXCJERC1NTS1ZWSBoOm1tOnNzIGFcIik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vJFFKTG9nZ2VyLmxvZyhcInByb2plY3RzaG91cnNMVlcudXBkYXRlXCIpO1xuICAgICAgICB9KTtcblxuXG5cbiAgICB9XG5cblxuXG4gICAgJFFKQ1RpbWVDb3VudGVyLmNyZWF0ZSh7XG4gICAgICAgIG5hbWU6ICdjdXJyZW50JyxcbiAgICAgICAgYXBpOiB7XG4gICAgICAgICAgICBjb250cm9sbGVyOiAncHJvamVjdCcsXG4gICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICBhY3Rpb246ICdob3Vyc19jdXJyZW50JyxcbiAgICAgICAgICAgICAgICBfaWRfcHJvamVjdDogLTFcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgb25Jbml0OiBmdW5jdGlvbihzZWxmKSB7XG4gICAgICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZChzZWxmLnJlc2l0ZW0pIHx8IF8uaXNOdWxsKHNlbGYucmVzaXRlbSkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLml0ZW0gPSB7XG4gICAgICAgICAgICAgICAgICAgIF9pZDogLTEsXG4gICAgICAgICAgICAgICAgICAgIF9pZF9wcm9qZWN0OiAkc2NvcGUuaG91cnNwcm9qZWN0Q0JPLmNvZGUsXG4gICAgICAgICAgICAgICAgICAgIF9pZF91c2VyOiBudWxsLCAvL3NhdmUgY3VycmVudCBiYXNlZCBvbiB0b2tlbi5cbiAgICAgICAgICAgICAgICAgICAgc3RhcnQ6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGVuZDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgZGlmZmVyZW5jZTogbnVsbFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNlbGYuaXRlbSA9IHNlbGYucmVzaXRlbTtcbiAgICAgICAgICAgICAgICBzZWxmLnJlc3VtZShzZWxmLml0ZW0uc3RhcnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBvblN0YXJ0Q2hhbmdlOiBmdW5jdGlvbihuZXdWYWwsIHNlbGYpIHtcbiAgICAgICAgICAgIHNlbGYuaXRlbS5zdGFydCA9IG5ld1ZhbDtcbiAgICAgICAgfSxcbiAgICAgICAgb25TdG9wQ2hhbmdlOiBmdW5jdGlvbihuZXdWYWwsIHNlbGYpIHtcbiAgICAgICAgICAgIHNlbGYuaXRlbS5lbmQgPSBuZXdWYWw7XG4gICAgICAgIH0sXG4gICAgICAgIG9uRGlmZkNoYW5nZTogZnVuY3Rpb24obmV3VmFsLCBuZXdWYWxGb3JtYXRlZCwgc2VsZikge1xuICAgICAgICAgICAgc2VsZi5pdGVtLmRpZmZlcmVuY2UgPSBuZXdWYWw7XG4gICAgICAgIH0sXG4gICAgICAgIG9uVmFsaWRhdGVTdGFydDogZnVuY3Rpb24oc2VsZikge1xuICAgICAgICAgICAgdmFyIHZhbCA9ICFfLmlzVW5kZWZpbmVkKHNlbGYuaXRlbSkgJiYgIV8uaXNVbmRlZmluZWQoc2VsZi5pdGVtLl9pZF9wcm9qZWN0KSAmJiBzZWxmLml0ZW0uX2lkX3Byb2plY3QgIT0gbnVsbCAmJiBzZWxmLml0ZW0uX2lkX3Byb2plY3QgIT0gXCJcIjtcbiAgICAgICAgICAgIGlmICghdmFsKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5lcnJvcnMgPSBbXTtcbiAgICAgICAgICAgICAgICBzZWxmLmFkZEVycm9yKFwiUHJvamVjdCByZXF1aXJlZFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgIH0sXG4gICAgICAgIG9uU3RhcnRDbGljazogZnVuY3Rpb24oc2VsZikge1xuICAgICAgICAgICAgJHNjb3BlLmhvdXJzY29tcGFueUNCTy5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICAkc2NvcGUuaG91cnNwcm9qZWN0Q0JPLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAkUUpBcGkuZ2V0Q29udHJvbGxlcihcInByb2plY3RcIikucG9zdCh7XG4gICAgICAgICAgICAgICAgYWN0aW9uOiAnaG91cnNfc2F2ZSdcbiAgICAgICAgICAgIH0sIHNlbGYuaXRlbSwgZnVuY3Rpb24ocmVzKSB7XG4gICAgICAgICAgICAgICAgJFFKTG9nZ2VyLmxvZyhcImhvdXJzIC0+IHNhdmUgLT4gc3VjY2Vzc1wiKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuICAgICAgICBvblN0b3BDbGljazogZnVuY3Rpb24oc2VsZikge1xuICAgICAgICAgICAgJHNjb3BlLmhvdXJzY29tcGFueUNCTy5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgJHNjb3BlLmhvdXJzcHJvamVjdENCTy5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICRRSkFwaS5nZXRDb250cm9sbGVyKFwicHJvamVjdFwiKS5wb3N0KHtcbiAgICAgICAgICAgICAgICBhY3Rpb246ICdob3Vyc19zYXZlJ1xuICAgICAgICAgICAgfSwgc2VsZi5pdGVtLCBmdW5jdGlvbihyZXMpIHtcbiAgICAgICAgICAgICAgICAkUUpMb2dnZXIubG9nKFwiaG91cnMgLT4gc2F2ZSAtPiBzdWNjZXNzXCIpO1xuICAgICAgICAgICAgICAgIHNlbGYuYWRkRXJyb3IoXCJEdXJhdGlvbjogXCIgKyAkUUpIZWxwZXJGdW5jdGlvbnMuZ2V0VGltZXN0YW1wRHVyYXRpb24oc2VsZi5pdGVtLmRpZmZlcmVuY2UpKTtcbiAgICAgICAgICAgICAgICBzZWxmLmFkZEVycm9yKFwiVGltZXN0YW1wIHNhdmVkXCIpO1xuICAgICAgICAgICAgICAgICRzY29wZS5wcm9qZWN0c2hvdXJzTFZXLnVwZGF0ZSgpO1xuICAgICAgICAgICAgICAgICRzY29wZS4kZW1pdCgncHJvamVjdC51cGRhdGUnLCB7XG4gICAgICAgICAgICAgICAgICAgIGluaXRpYWxpemVUaW1lcjogZmFsc2VcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy9cblxuICAgICAgICAgICAgaWYgKCRzY29wZS5wcm9qZWN0aW5mbykge1xuICAgICAgICAgICAgICAgICRzY29wZS5wcm9qZWN0aW5mby5zaG93ID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LCAkc2NvcGUpOyAvLy5pbml0KCk7XG4gICAgJHNjb3BlLiRvbignaG91cnNwcm9qZWN0Q0JPLmNoYW5nZScsIGZ1bmN0aW9uKCkge1xuICAgICAgICAkc2NvcGUuJGVtaXQoJ3Byb2plY3QudXBkYXRlJywge1xuICAgICAgICAgICAgaW5pdGlhbGl6ZVRpbWVyOiB0cnVlXG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgJHNjb3BlLiRvbigncHJvamVjdC51cGRhdGUnLCBmdW5jdGlvbihhcmcsIHBhcmFtcykge1xuXG4gICAgICAgIC8vc3RvcmVzIGNvbXBhbnkscHJvamVjdFxuICAgICAgICAkcm9vdFNjb3BlLnNlc3Npb24ucHJvamVjdGhvdXJzX2hvdXJzY29tcGFueUNCT0NPREUgPSAkc2NvcGUuaG91cnNjb21wYW55Q0JPLmNvZGU7XG4gICAgICAgICRyb290U2NvcGUuc2Vzc2lvbi5wcm9qZWN0aG91cnNfaG91cnNwcm9qZWN0Q0JPQ09ERSA9ICRzY29wZS5ob3Vyc3Byb2plY3RDQk8uY29kZTtcbiAgICAgICAgJFFKTG9jYWxTZXNzaW9uLnNhdmUoKTtcblxuXG4gICAgICAgIHZhciBfaWRfcHJvamVjdCA9ICRzY29wZS5ob3Vyc3Byb2plY3RDQk8uY29kZTsgLy9VUERBVEUgSU5GT1JNQVRJT04gQUJPVVQgUFJPSkVDVCBIT1VSU1xuICAgICAgICBpZiAoX2lkX3Byb2plY3QgIT0gLTEpIHtcbiAgICAgICAgICAgIHVwZGF0ZVByb2plY3RJbmZvKF9pZF9wcm9qZWN0KTtcblxuICAgICAgICAgICAgaWYgKHBhcmFtcy5pbml0aWFsaXplVGltZXIpIHtcbiAgICAgICAgICAgICAgICAkc2NvcGUuY3VycmVudC5hcGkucGFyYW1zLl9pZF9wcm9qZWN0ID0gX2lkX3Byb2plY3Q7IC8vaWZhIHByaiBpdHMgc2VsZWN0ZWQuIFVwZGF0ZSB0aW1lciBzdGF0dXNcbiAgICAgICAgICAgICAgICAkc2NvcGUuY3VycmVudC5pbml0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgIH0pO1xuXG4gICAgZnVuY3Rpb24gdXBkYXRlUHJvamVjdEluZm8oX2lkX3Byb2plY3QpIHtcbiAgICAgICAgJFFKQXBpLmdldENvbnRyb2xsZXIoXCJwcm9qZWN0XCIpLmdldCh7XG4gICAgICAgICAgICBhY3Rpb246IFwiaG91cnNfYWxsXCIsXG4gICAgICAgICAgICBfaWRfcHJvamVjdDogX2lkX3Byb2plY3QudG9TdHJpbmcoKVxuICAgICAgICB9LCBmdW5jdGlvbihyZXMpIHtcbiAgICAgICAgICAgICRRSkxvZ2dlci5sb2coXCJwcm9qZWN0IGhvdXJzX2FsbCAtPiBzdWNjZXNzXCIpO1xuICAgICAgICAgICAgdmFyIGhvdXJzID0gW107XG4gICAgICAgICAgICBfLmVhY2gocmVzLml0ZW1zLCBmdW5jdGlvbihpdGVtKSB7XG4gICAgICAgICAgICAgICAgdmFyIGV4aXN0cyA9ICFfLmlzVW5kZWZpbmVkKF8uZmluZChob3VycywgZnVuY3Rpb24oaW5mb0l0ZW0pIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGluZm9JdGVtLmxvZ2lubmFtZSA9PSBpdGVtLmxvZ2lubmFtZTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICAgICAgICBpZiAoaXRlbS5lbmQgPT0gbnVsbCkgZXhpc3RzID0gdHJ1ZTsgLy9cbiAgICAgICAgICAgICAgICBpZiAoZXhpc3RzKSByZXR1cm47XG4gICAgICAgICAgICAgICAgdmFyIGhvdXJzZnJvbSA9IF8uZmlsdGVyKHJlcy5pdGVtcywgZnVuY3Rpb24oaSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaS5sb2dpbm5hbWUgPT0gaXRlbS5sb2dpbm5hbWU7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdmFyIGRpZmYgPSAwO1xuICAgICAgICAgICAgICAgIF8uZWFjaChob3Vyc2Zyb20sIGZ1bmN0aW9uKGkpIHtcbiAgICAgICAgICAgICAgICAgICAgZGlmZiArPSBwYXJzZUludChpLmRpZmZlcmVuY2UpO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgaG91cnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGxvZ2lubmFtZTogaXRlbS5sb2dpbm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGRpZmY6IGRpZmYsXG4gICAgICAgICAgICAgICAgICAgIGRpZmZGb3JtYXRlZDogJFFKSGVscGVyRnVuY3Rpb25zLmdldFRpbWVzdGFtcER1cmF0aW9uKGRpZmYpXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vY29uc29sZS5pbmZvKGluZm8pO1xuICAgICAgICAgICAgdmFyIGhvdXJzVG90YWwgPSAwO1xuICAgICAgICAgICAgXy5lYWNoKGhvdXJzLCBmdW5jdGlvbihpKSB7XG4gICAgICAgICAgICAgICAgaG91cnNUb3RhbCArPSBwYXJzZUludChpLmRpZmYpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkc2NvcGUucHJvamVjdGluZm8gPSB7XG4gICAgICAgICAgICAgICAgaG91cnM6IGhvdXJzLFxuICAgICAgICAgICAgICAgIGhvdXJzVG90YWw6IGhvdXJzVG90YWwsXG4gICAgICAgICAgICAgICAgaG91cnNUb3RhbEZvcm1hdGVkOiAkUUpIZWxwZXJGdW5jdGlvbnMuZ2V0VGltZXN0YW1wRHVyYXRpb24oaG91cnNUb3RhbCksXG4gICAgICAgICAgICAgICAgc2hvdzogdHJ1ZVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIC8vY29uc29sZS5pbmZvKCRzY29wZS5wcm9qZWN0aW5mbyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vTG9hZCBjb250cm9scyB3aGVuIGN1cnJlbnQgdXNlciBpdHMgYXZhbGlhYmxlLlxuICAgIHZhciBjb250cm9sc0xvYWRlZCA9IGZhbHNlO1xuICAgICRyb290U2NvcGUuJG9uKCdjdXJyZW50VXNlci5jaGFuZ2UnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgbG9hZENvbnRyb2xzKCk7XG4gICAgICAgIGNvbnRyb2xzTG9hZGVkID0gdHJ1ZTtcbiAgICB9KTtcbiAgICBpZiAoIWNvbnRyb2xzTG9hZGVkICYmICFfLmlzVW5kZWZpbmVkKCRyb290U2NvcGUuY3VycmVudFVzZXIpKSB7XG4gICAgICAgIGxvYWRDb250cm9scygpO1xuICAgICAgICBjb250cm9sc0xvYWRlZCA9IHRydWU7XG4gICAgfVxuXG4gICAgLy9kZWZhdWx0c1xuICAgICR0aW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAkc2NvcGUucHJvamVjdGhvdXJzRmlsdGVyLmZpbHRlcigpO1xuICAgIH0sIDIwMDApO1xuXG5cbiAgICBzY29wZSA9ICRzY29wZTtcblxufSlcblxuXG5cbm1vZHVsZS5jb250cm9sbGVyKCdQcm9qZWN0SG91cnNFZGl0Q29udHJvbGxlcicsIGZ1bmN0aW9uKFxuICAgICRRSkNDb21ib2JveCwgJFFKQ1NlbGVjdGtleSwgJFFKQ0xpc3R2aWV3LCAkUUpDRmlsdGVyLCAkUUpMb2dnZXIsICRRSkhlbHBlckZ1bmN0aW9ucywgJHNjb3BlLCAkcm9vdFNjb3BlLCAkUUpMb2dpbk1vZHVsZSwgJFFKQXBpLCAkdGltZW91dCwgJHN0YXRlLCAkUUpMb2dpbk1vZHVsZVxuKSB7XG5cblxuICAgICRRSkxvZ2dlci5sb2coXCJQcm9qZWN0SG91cnNFZGl0Q29udHJvbGxlciAtPiBpbml0aWFsaXplZFwiKTtcblxuXG4gICAgJHNjb3BlLmJyZWFkY3J1bWIgPSB7XG4gICAgICAgIG5hbWU6ICdQcm9qZWN0IEhvdXJzJyxcbiAgICAgICAgbGlzdDogW3tcbiAgICAgICAgICAgIG5hbWU6ICdQcm9qZWN0cyBIb3VycycsXG4gICAgICAgICAgICBzdGF0ZTogJ21vZHVsZS1wcm9qZWN0LWhvdXJzLWxpc3QnLFxuICAgICAgICAgICAgLy9mYTogJ2ZhLWRhc2hib2FyZCdcbiAgICAgICAgfV0sXG4gICAgICAgIGFjdGl2ZTogXCJMb2FkaW5nXCJcbiAgICB9O1xuXG5cbiAgICB2YXIgX2lkID0gJHN0YXRlLnBhcmFtcy5pZDtcblxuICAgICRzY29wZS5jcnVkID0ge1xuICAgICAgICBlcnJvcnM6IFtdXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2hvd0Vycm9yKGVycm9yKSB7XG4gICAgICAgICRzY29wZS5jcnVkLmVycm9ycy5wdXNoKGVycm9yKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZm9ybUhhc0Vycm9ycygpIHtcbiAgICAgICAgJHNjb3BlLmNydWQuZXJyb3JzID0gW107XG4gICAgICAgIHZhciBoYXNFcnJvcnMgPSBmYWxzZTtcbiAgICAgICAgaWYgKF8uaXNVbmRlZmluZWQoJHNjb3BlLml0ZW0uc3RhcnQpIHx8ICRzY29wZS5pdGVtLnN0YXJ0ID09ICcnKSB7XG4gICAgICAgICAgICBoYXNFcnJvcnMgPSBzaG93RXJyb3IoJ1N0YXJ0IHJlcXVpcmVkJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKF8uaXNVbmRlZmluZWQoJHNjb3BlLml0ZW0uZW5kKSB8fCAkc2NvcGUuaXRlbS5lbmQgPT0gJycpIHtcbiAgICAgICAgICAgIGhhc0Vycm9ycyA9IHNob3dFcnJvcignRW5kIHJlcXVpcmVkJyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGhhc0Vycm9ycztcbiAgICB9XG5cbiAgICAkc2NvcGUuc2F2ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAoIWZvcm1IYXNFcnJvcnMoKSkge1xuICAgICAgICAgICAgJFFKQXBpLmdldENvbnRyb2xsZXIoJ3Byb2plY3QnKS5wb3N0KHtcbiAgICAgICAgICAgICAgICBhY3Rpb246ICdob3Vyc19zYXZlJ1xuICAgICAgICAgICAgfSwgJHNjb3BlLml0ZW0sIGZ1bmN0aW9uKHJlcykge1xuICAgICAgICAgICAgICAgICRRSkxvZ2dlci5sb2coXCJQcm9qZWN0SG91cnNFZGl0Q29udHJvbGxlciAtPiAtPiBwcm9qZWN0IGhvdXJzX3NhdmUgLT4gc3VjY2Vzc1wiKTtcbiAgICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAgIHNob3dFcnJvcignQ2FtYmlvcyBndWFyZGFkb3MnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuICAgIH07XG4gICAgJHNjb3BlLmNhbmNlbCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAkUUpIZWxwZXJGdW5jdGlvbnMuY2hhbmdlU3RhdGUoJ21vZHVsZS1wcm9qZWN0LWhvdXJzLWxpc3QnKTtcbiAgICB9O1xuICAgICRzY29wZS5kZWxldGUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHIgPSBjb25maXJtKFwiRGVsZXRlIFtcIiArICRzY29wZS5pdGVtLnN0YXJ0ICsgXCIgLSBcIiArICRzY29wZS5pdGVtLmVuZCArIFwiXSA/XCIpO1xuICAgICAgICBpZiAociA9PSB0cnVlKSB7XG4gICAgICAgICAgICAkUUpBcGkuZ2V0Q29udHJvbGxlcigncHJvamVjdCcpLnBvc3Qoe1xuICAgICAgICAgICAgICAgIGFjdGlvbjogJ2hvdXJzX2RlbGV0ZSdcbiAgICAgICAgICAgIH0sICRzY29wZS5pdGVtLCBmdW5jdGlvbihyZXMpIHtcbiAgICAgICAgICAgICAgICAkUUpMb2dnZXIubG9nKFwiUHJvamVjdEhvdXJzRWRpdENvbnRyb2xsZXIgLT4gcHJvamVjdCBkZWxldGUgLT4gc3VjY2Vzc1wiKTtcbiAgICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAgIHNob3dFcnJvcignQ2FtYmlvcyBndWFyZGFkb3MnKTtcbiAgICAgICAgICAgICAgICBzaG93RXJyb3IoJHNjb3BlLml0ZW0ubmFtZSArICcgZWxpbWluYWRvJyk7XG5cbiAgICAgICAgICAgICAgICAkdGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgJFFKSGVscGVyRnVuY3Rpb25zLmNoYW5nZVN0YXRlKCdtb2R1bGUtcHJvamVjdC1ob3Vycy1saXN0Jyk7XG4gICAgICAgICAgICAgICAgfSwgNTAwKTtcblxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7fVxuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gY3JlYXRlKCkge1xuICAgICAgICAkUUpMb2dnZXIubG9nKFwiUHJvamVjdEhvdXJzRWRpdENvbnRyb2xsZXIgLT4gY3JlYXRlIG5ldyFcIik7XG4gICAgICAgICRzY29wZS5pdGVtID0ge1xuICAgICAgICAgICAgX2lkOiAtMSxcbiAgICAgICAgICAgIF9pZF9wcm9qZWN0OiAnJyxcbiAgICAgICAgICAgIF9pZF91c2VyOiAnJyxcbiAgICAgICAgICAgIHN0YXJ0OiAnJyxcbiAgICAgICAgICAgIGVuZDogJycsXG4gICAgICAgICAgICBtaWxsaXNlY29uZHM6ICcnLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxvYWRDb250cm9scygpIHtcblxuXG4gICAgfVxuXG4gICAgaWYgKF9pZCA9PSAtMSkge1xuICAgICAgICAvL0NSRUFURVxuICAgICAgICAvL2NyZWF0ZSgpO1xuICAgICAgICBsb2FkQ29udHJvbHMoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvL1VQREFURVxuICAgICAgICAkUUpBcGkuZ2V0Q29udHJvbGxlcigncHJvamVjdCcpLmdldCh7XG4gICAgICAgICAgICBhY3Rpb246ICdob3Vyc19zaW5nbGUnLFxuICAgICAgICAgICAgaWQ6IF9pZFxuICAgICAgICB9LCBmdW5jdGlvbihyZXMpIHtcbiAgICAgICAgICAgICRRSkxvZ2dlci5sb2coXCJQcm9qZWN0SG91cnNFZGl0Q29udHJvbGxlciAtPiBwcm9qZWN0IGhvdXJzX3NpbmdsZSAtPiBzdWNjZXNzXCIpO1xuICAgICAgICAgICAgLy9jb25zb2xlLmluZm8ocmVzLml0ZW0pO1xuICAgICAgICAgICAgJHNjb3BlLml0ZW0gPSByZXMuaXRlbTtcbiAgICAgICAgICAgICRzY29wZS5icmVhZGNydW1iLmFjdGl2ZSA9ICRzY29wZS5pdGVtLnVzZXJOYW1lICsgXCIncyBUaW1lc3RhbXBcIjtcbiAgICAgICAgICAgIGxvYWRDb250cm9scygpO1xuICAgICAgICB9KTtcblxuICAgIH1cbn0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJodFpreDRcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLlxcXFxjb250cm9sbGVyc1xcXFxtb2QucHJvamVjdGhvdXJzQ3RybC5qc1wiLFwiLy4uXFxcXGNvbnRyb2xsZXJzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIG1vZHVsZSA9IHJlcXVpcmUoJy4vX21vZHVsZV9pbml0LmpzJyk7XG5tb2R1bGUuY29udHJvbGxlcignUHJvamVjdExpc3RDb250cm9sbGVyJywgZnVuY3Rpb24oXG4gICAgJFFKQ0NvbWJvYm94LCAkUUpDU2VsZWN0a2V5LCAkUUpDTGlzdHZpZXcsICRRSkNGaWx0ZXIsICRRSkxvZ2dlciwgJFFKSGVscGVyRnVuY3Rpb25zLCAkc2NvcGUsICRyb290U2NvcGUsICRRSkxvZ2luTW9kdWxlLCAkUUpBcGksICR0aW1lb3V0LCAkc3RhdGUsICRRSkxvZ2luTW9kdWxlXG4pIHtcblxuICAgICRRSkxvZ2dlci5sb2coXCJQcm9qZWN0TGlzdENvbnRyb2xsZXIgLT4gaW5pdGlhbGl6ZWRcIik7XG5cblxuICAgICRzY29wZS5icmVhZGNydW1iID0ge1xuICAgICAgICBuYW1lOiAnUHJvamVjdHMnLFxuICAgICAgICBsaXN0OiBbXG4gICAgICAgICAgICAvL3tuYW1lOidOb25lMicsc3RhdGU6JycsZmE6J2ZhLWRhc2hib2FyZCd9XG4gICAgICAgIF0sXG4gICAgICAgIGFjdGl2ZTogXCJQcm9qZWN0c1wiXG4gICAgfTtcblxuICAgICRzY29wZS5wcm9qZWN0cyA9IFtdOyAvL2hvbGRzIHByb2plY3RzIGZyb20gZGJcbiAgICAkc2NvcGUucHJvamVjdHNEYXRhID0gbnVsbDsgLy9ob2xkcyBwcm9qZWN0cyBkaXZpZGVkIHBlciBwYWdlXG5cbiAgICAvL2ZpbHRlclxuICAgICRRSkNGaWx0ZXIuY3JlYXRlKHtcbiAgICAgICAgbmFtZTogJ3Byb2plY3RzRmlsdGVyJyxcbiAgICAgICAgZmllbGRzOiBbe1xuICAgICAgICAgICAgbmFtZTogJ25hbWUnLFxuICAgICAgICAgICAgYXJyYXlOYW1lOiAncHJvamVjdHMnLFxuICAgICAgICAgICAgYmluZFRvOiBbJ25hbWUnXVxuICAgICAgICB9LCB7XG4gICAgICAgICAgICBuYW1lOiAnZGVzY3JpcHRpb24nLFxuICAgICAgICAgICAgYXJyYXlOYW1lOiAncHJvamVjdHMnLFxuICAgICAgICAgICAgYmluZFRvOiBbJ2Rlc2NyaXB0aW9uJ11cbiAgICAgICAgfSwge1xuICAgICAgICAgICAgbmFtZTogJ19pZF9jb21wYW55JyxcbiAgICAgICAgICAgIGFycmF5TmFtZTogJ3Byb2plY3RzJyxcbiAgICAgICAgICAgIGJpbmRUbzogWydfaWRfY29tcGFueSddXG4gICAgICAgIH1dXG4gICAgfSwgJHNjb3BlKTtcblxuXG4gICAgZnVuY3Rpb24gbG9hZENvbnRyb2xzKCkge1xuICAgICAgICAvL2NvbWJvYm94XG4gICAgICAgICRRSkNDb21ib2JveC5jcmVhdGUoe1xuICAgICAgICAgICAgbmFtZTogJ2NvbXBhbnlDQk8nLFxuICAgICAgICAgICAgbGFiZWw6IFwiQ29tcGFueVwiLFxuICAgICAgICAgICAgY29kZTogLTEsIC8vJHJvb3RTY29wZS5jdXJyZW50VXNlci5fZ3JvdXBfaWQsXG4gICAgICAgICAgICBjb2RlX2NvcHl0bzogJ3Byb2plY3RzRmlsdGVyLmZpZWxkcy5faWRfY29tcGFueScsXG4gICAgICAgICAgICBhcGk6IHtcbiAgICAgICAgICAgICAgICBjb250cm9sbGVyOiAnY29tcGFueScsXG4gICAgICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbjogJ2NvbWJvYm94X2FsbCdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LCAkc2NvcGUpO1xuICAgICAgICAvL2xpc3R2aWV3XG4gICAgICAgICRRSkNMaXN0dmlldy5jcmVhdGUoe1xuICAgICAgICAgICAgbmFtZTogJ3Byb2plY3RzTFZXJyxcbiAgICAgICAgICAgIGRhdGFBcnJheTogJ3Byb2plY3RzJyxcbiAgICAgICAgICAgIHBhZ2VkRGF0YUFycmF5OiAncHJvamVjdHNEYXRhJyxcbiAgICAgICAgICAgIGFwaToge1xuICAgICAgICAgICAgICAgIGNvbnRyb2xsZXI6ICdwcm9qZWN0JyxcbiAgICAgICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiAnYWxsJyxcbiAgICAgICAgICAgICAgICAgICAgX2lkX2NvbXBhbnk6IC0xXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNvbHVtbnM6IFt7XG4gICAgICAgICAgICAgICAgbmFtZTogJ25hbWUnLFxuICAgICAgICAgICAgICAgIGxhYmVsOiAnTmFtZSdcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZGVzY3JpcHRpb24nLFxuICAgICAgICAgICAgICAgIGxhYmVsOiAnRGVzY3JpcHRpb24nXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NvbXBhbnlEZXNjcmlwdGlvbicsXG4gICAgICAgICAgICAgICAgbGFiZWw6ICdDb21wYW55J1xuICAgICAgICAgICAgfV0sXG4gICAgICAgICAgICBpdGVtQ2xpY2s6IGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgICAgICAgICAgICAkUUpIZWxwZXJGdW5jdGlvbnMuY2hhbmdlU3RhdGUoJ21vZHVsZS1wcm9qZWN0LWVkaXQnLCB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBpdGVtLl9pZFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCAkc2NvcGUpO1xuICAgIH1cblxuXG4gICAgLy9Mb2FkIGNvbnRyb2xzIHdoZW4gY3VycmVudCB1c2VyIGl0cyBhdmFsaWFibGUuXG4gICAgdmFyIGNvbnRyb2xzTG9hZGVkID0gZmFsc2U7XG4gICAgJHJvb3RTY29wZS4kb24oJ2N1cnJlbnRVc2VyLmNoYW5nZScsIGZ1bmN0aW9uKCkge1xuICAgICAgICBsb2FkQ29udHJvbHMoKTtcbiAgICAgICAgY29udHJvbHNMb2FkZWQgPSB0cnVlO1xuICAgIH0pO1xuICAgIGlmICghY29udHJvbHNMb2FkZWQgJiYgIV8uaXNVbmRlZmluZWQoJHJvb3RTY29wZS5jdXJyZW50VXNlcikpIHtcbiAgICAgICAgbG9hZENvbnRyb2xzKCk7XG4gICAgICAgIGNvbnRyb2xzTG9hZGVkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICAvL2RlZmF1bHRzXG4gICAgJHRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICRzY29wZS5wcm9qZWN0c0ZpbHRlci5maWx0ZXIoKTtcbiAgICB9LCAyMDAwKTtcblxufSlcblxubW9kdWxlLmNvbnRyb2xsZXIoJ1Byb2plY3RFZGl0Q29udHJvbGxlcicsIGZ1bmN0aW9uKFxuICAgICRRSkNDb21ib2JveCwgJFFKQ1NlbGVjdGtleSwgJFFKQ0xpc3R2aWV3LCAkUUpDRmlsdGVyLCAkUUpMb2dnZXIsICRRSkhlbHBlckZ1bmN0aW9ucywgJHNjb3BlLCAkcm9vdFNjb3BlLCAkUUpMb2dpbk1vZHVsZSwgJFFKQXBpLCAkdGltZW91dCwgJHN0YXRlLCAkUUpMb2dpbk1vZHVsZVxuKSB7XG5cbiAgICAkUUpMb2dnZXIubG9nKFwiUHJvamVjdEVkaXRDb250cm9sbGVyIC0+IGluaXRpYWxpemVkXCIpO1xuXG4gICAgJHNjb3BlLmlkID0gJHN0YXRlLnBhcmFtcy5pZDtcbiAgICB2YXIgX3Byb2plY3RfaWQgPSAkc3RhdGUucGFyYW1zLmlkO1xuICAgIHZhciBhY3Rpb24gPSAoKCRzY29wZS5pZC50b1N0cmluZygpID09PSAnLTEnKT8nTmV3JzonRWRpdCcpO1xuXG4gICAgJHNjb3BlLmJyZWFkY3J1bWIgPSB7XG4gICAgICAgIG5hbWU6ICdQcm9qZWN0JyxcbiAgICAgICAgbGlzdDogW3tcbiAgICAgICAgICAgIG5hbWU6ICdQcm9qZWN0cycsXG4gICAgICAgICAgICBzdGF0ZTogJ21vZHVsZS1wcm9qZWN0LWxpc3QnLFxuICAgICAgICAgICAgLy9mYTogJ2ZhLWRhc2hib2FyZCdcbiAgICAgICAgfV0sXG4gICAgICAgIGFjdGl2ZTogYWN0aW9uXG4gICAgfTtcblxuXG5cblxuICAgICRzY29wZS5lbmFibGVEZWxldGUgPSBmdW5jdGlvbigpe1xuICAgICAgICByZXR1cm4gJHNjb3BlLmlkICYmICRzY29wZS5pZC50b1N0cmluZygpICE9ICctMSc7XG4gICAgfTtcblxuICAgICRzY29wZS5jcnVkID0ge1xuICAgICAgICBlcnJvcnM6IFtdXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2hvd0Vycm9yKGVycm9yKSB7XG4gICAgICAgICRzY29wZS5jcnVkLmVycm9ycy5wdXNoKGVycm9yKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZm9ybUhhc0Vycm9ycygpIHtcbiAgICAgICAgJHNjb3BlLmNydWQuZXJyb3JzID0gW107XG4gICAgICAgIHZhciBoYXNFcnJvcnMgPSBmYWxzZTtcbiAgICAgICAgaWYgKF8uaXNVbmRlZmluZWQoJHNjb3BlLml0ZW0ubmFtZSkgfHwgJHNjb3BlLml0ZW0ubmFtZSA9PSAnJykge1xuICAgICAgICAgICAgaGFzRXJyb3JzID0gc2hvd0Vycm9yKCdOYW1lIHJlcXVpcmVkJyk7XG4gICAgICAgIH1cbiAgICAgICAgLypcbiAgICAgICAgaWYgKF8uaXNVbmRlZmluZWQoJHNjb3BlLml0ZW0uZGVzY3JpcHRpb24pIHx8ICRzY29wZS5pdGVtLmRlc2NyaXB0aW9uID09ICcnKSB7XG4gICAgICAgICAgICBoYXNFcnJvcnMgPSBzaG93RXJyb3IoJ0ZpcnN0IG5hbWUgcmVxdWlyZWQnKTtcbiAgICAgICAgfVxuICAgICAgICAqL1xuICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZCgkc2NvcGUuaXRlbS5faWRfY29tcGFueSkgfHwgJHNjb3BlLml0ZW0uX2lkX2NvbXBhbnkgPT0gJycpIHtcbiAgICAgICAgICAgIGhhc0Vycm9ycyA9IHNob3dFcnJvcignQ29tcGFueSByZXF1aXJlZCcpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBoYXNFcnJvcnM7XG4gICAgfVxuXG4gICAgJHNjb3BlLnNhdmUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKCFmb3JtSGFzRXJyb3JzKCkpIHtcbiAgICAgICAgICAgICRRSkFwaS5nZXRDb250cm9sbGVyKCdwcm9qZWN0JykucG9zdCh7XG4gICAgICAgICAgICAgICAgYWN0aW9uOiAnc2F2ZSdcbiAgICAgICAgICAgIH0sICRzY29wZS5pdGVtLCBmdW5jdGlvbihyZXMpIHtcbiAgICAgICAgICAgICAgICAkUUpMb2dnZXIubG9nKFwiUHJvamVjdEVkaXRDb250cm9sbGVyIC0+IC0+IHByb2plY3Qgc2F2ZSAtPiBzdWNjZXNzXCIpO1xuICAgICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAgICAgc2hvd0Vycm9yKCdDYW1iaW9zIGd1YXJkYWRvcycpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgfTtcbiAgICAkc2NvcGUuY2FuY2VsID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICRRSkhlbHBlckZ1bmN0aW9ucy5jaGFuZ2VTdGF0ZSgnbW9kdWxlLXByb2plY3QtbGlzdCcpO1xuICAgIH07XG4gICAgJHNjb3BlLmRlbGV0ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgciA9IGNvbmZpcm0oXCJEZWxldGUgXCIgKyAkc2NvcGUuaXRlbS5uYW1lICsgXCIgP1wiKTtcbiAgICAgICAgaWYgKHIgPT0gdHJ1ZSkge1xuICAgICAgICAgICAgJFFKQXBpLmdldENvbnRyb2xsZXIoJ3Byb2plY3QnKS5wb3N0KHtcbiAgICAgICAgICAgICAgICBhY3Rpb246ICdkZWxldGUnXG4gICAgICAgICAgICB9LCAkc2NvcGUuaXRlbSwgZnVuY3Rpb24ocmVzKSB7XG4gICAgICAgICAgICAgICAgJFFKTG9nZ2VyLmxvZyhcIlByb2plY3RFZGl0Q29udHJvbGxlciAtPiBwcm9qZWN0IGRlbGV0ZSAtPiBzdWNjZXNzXCIpO1xuICAgICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAgICAgc2hvd0Vycm9yKCdDYW1iaW9zIGd1YXJkYWRvcycpO1xuICAgICAgICAgICAgICAgIHNob3dFcnJvcigkc2NvcGUuaXRlbS5uYW1lICsgJyBlbGltaW5hZG8nKTtcblxuICAgICAgICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAkUUpIZWxwZXJGdW5jdGlvbnMuY2hhbmdlU3RhdGUoJ21vZHVsZS1wcm9qZWN0LWxpc3QnKTtcbiAgICAgICAgICAgICAgICB9LCA1MDApO1xuXG4gICAgICAgICAgICAgICAgY3JlYXRlKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHt9XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBjcmVhdGUoKSB7XG4gICAgICAgICRRSkxvZ2dlci5sb2coXCJQcm9qZWN0RWRpdENvbnRyb2xsZXIgLT4gY3JlYXRlIG5ldyFcIik7XG4gICAgICAgICRzY29wZS5pdGVtID0ge1xuICAgICAgICAgICAgbmFtZTogJycsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogJycsXG4gICAgICAgICAgICBfaWRfY29tcGFueTogJycsXG4gICAgICAgICAgICBfaWQ6IC0xXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbG9hZENvbnRyb2xzKCkge1xuICAgICAgICAvL2NvbWJvYm94XG4gICAgICAgICRRSkNDb21ib2JveC5jcmVhdGUoe1xuICAgICAgICAgICAgbmFtZTogJ2NvbXBhbnlDQk8nLFxuICAgICAgICAgICAgbGFiZWw6IFwiQ29tcGFueVwiLFxuICAgICAgICAgICAgY29kZTogJHNjb3BlLml0ZW0uX2lkX2NvbXBhbnksXG4gICAgICAgICAgICBjb2RlX2NvcHl0bzogJ2l0ZW0uX2lkX2NvbXBhbnknLFxuICAgICAgICAgICAgYXBpOiB7XG4gICAgICAgICAgICAgICAgY29udHJvbGxlcjogJ2NvbXBhbnknLFxuICAgICAgICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb246ICdjb21ib2JveF9hbGwnXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSwgJHNjb3BlKTtcbiAgICB9XG5cbiAgICBpZiAoX3Byb2plY3RfaWQgPT0gLTEpIHtcbiAgICAgICAgLy9DUkVBVEVcbiAgICAgICAgY3JlYXRlKCk7XG4gICAgICAgIGxvYWRDb250cm9scygpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vVVBEQVRFXG4gICAgICAgICRRSkFwaS5nZXRDb250cm9sbGVyKCdwcm9qZWN0JykuZ2V0KHtcbiAgICAgICAgICAgIGFjdGlvbjogJ3NpbmdsZScsXG4gICAgICAgICAgICBpZDogX3Byb2plY3RfaWRcbiAgICAgICAgfSwgZnVuY3Rpb24ocmVzKSB7XG4gICAgICAgICAgICAkUUpMb2dnZXIubG9nKFwiUHJvamVjdEVkaXRDb250cm9sbGVyIC0+IHByb2plY3Qgc2luZ2xlIC0+IHN1Y2Nlc3NcIik7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8ocmVzLml0ZW0pO1xuICAgICAgICAgICAgJHNjb3BlLml0ZW0gPSByZXMuaXRlbTtcblxuICAgICAgICAgICAgJHNjb3BlLmJyZWFkY3J1bWIuYWN0aXZlID0gJHNjb3BlLml0ZW0ubmFtZTtcblxuICAgICAgICAgICAgbG9hZENvbnRyb2xzKCk7XG4gICAgICAgIH0pO1xuXG4gICAgfVxuXG59KTtcblxuXG47XG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uXFxcXGNvbnRyb2xsZXJzXFxcXG1vZC5wcm9qZWN0c0N0cmwuanNcIixcIi8uLlxcXFxjb250cm9sbGVyc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBtb2R1bGUgPSByZXF1aXJlKCcuL19tb2R1bGVfaW5pdC5qcycpO1xubW9kdWxlLmNvbnRyb2xsZXIoJ1VzZXJncm91cExpc3RDb250cm9sbGVyJywgZnVuY3Rpb24oXG5cdCRRSkNDb21ib2JveCwgJFFKQ1NlbGVjdGtleSwgJFFKQ0xpc3R2aWV3LCAkUUpDRmlsdGVyLCAkUUpMb2dnZXIsICRRSkhlbHBlckZ1bmN0aW9ucywgJHNjb3BlLCAkcm9vdFNjb3BlLCAkUUpMb2dpbk1vZHVsZSwgJFFKQXBpLCAkdGltZW91dCwgJHN0YXRlLCAkUUpMb2dpbk1vZHVsZVxuKSB7XG5cblx0JFFKTG9nZ2VyLmxvZyhcIlVzZXJncm91cExpc3RDb250cm9sbGVyIC0+IGluaXRpYWxpemVkXCIpO1xuXHQkc2NvcGUuYnJlYWRjcnVtYiA9IHtcblx0XHRuYW1lOiAnVXNlcmdyb3VwcycsXG5cdFx0bGlzdDogW10sXG5cdFx0YWN0aXZlOiBcIlVzZXJncm91cHNcIlxuXHR9O1xuXHQkc2NvcGUuaXRlbXMgPSBbXTsgLy9ob2xkcyBpdGVtcyBmcm9tIGRiXG5cdCRzY29wZS5sdndEYXRhID0gbnVsbDsgLy9ob2xkcyBpdGVtcyBkaXZpZGVkIHBlciBwYWdlXG5cblx0Ly9maWx0ZXJcblx0JFFKQ0ZpbHRlci5jcmVhdGUoe1xuXHRcdG5hbWU6ICdmaWx0ZXInLFxuXHRcdGZpZWxkczogW3tcblx0XHRcdG5hbWU6ICdkZXNjcmlwdGlvbicsXG5cdFx0XHRhcnJheU5hbWU6ICdpdGVtcycsXG5cdFx0XHRiaW5kVG86IFsnZGVzY3JpcHRpb24nXVxuXHRcdH0sIHtcblx0XHRcdG5hbWU6ICdfaWRfcHJvZmlsZScsXG5cdFx0XHRhcnJheU5hbWU6ICdpdGVtcycsXG5cdFx0XHRiaW5kVG86IFsnX2lkX3Byb2ZpbGUnXVxuXHRcdH1dXG5cdH0sICRzY29wZSk7XG5cblx0ZnVuY3Rpb24gbG9hZENvbnRyb2xzKCkge1xuXHRcdC8vY29tYm9ib3hcblx0XHQkUUpDQ29tYm9ib3guY3JlYXRlKHtcblx0XHRcdG5hbWU6ICdwcm9maWxlQ0JPJyxcblx0XHRcdGxhYmVsOiBcIlByb2ZpbGVcIixcblx0XHRcdGNvZGU6IC0xLFxuXHRcdFx0Y29kZV9jb3B5dG86ICdmaWx0ZXIuZmllbGRzLl9pZF9wcm9maWxlJyxcblx0XHRcdGFwaToge1xuXHRcdFx0XHRjb250cm9sbGVyOiAncHJvZmlsZScsXG5cdFx0XHRcdHBhcmFtczoge1xuXHRcdFx0XHRcdGFjdGlvbjogJ2NvbWJvYm94X2FsbCdcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9LCAkc2NvcGUpO1xuXHRcdC8vbGlzdHZpZXdcblx0XHQkUUpDTGlzdHZpZXcuY3JlYXRlKHtcblx0XHRcdG5hbWU6ICdsdncnLFxuXHRcdFx0ZGF0YUFycmF5OiAnaXRlbXMnLFxuXHRcdFx0cGFnZWREYXRhQXJyYXk6ICdsdndEYXRhJyxcblx0XHRcdGFwaToge1xuXHRcdFx0XHRjb250cm9sbGVyOiAndXNlcmdyb3VwJyxcblx0XHRcdFx0cGFyYW1zOiB7XG5cdFx0XHRcdFx0YWN0aW9uOiAnbHZ3ZGF0YSdcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGNvbHVtbnM6IFt7XG5cdFx0XHRcdG5hbWU6ICdkZXNjcmlwdGlvbicsXG5cdFx0XHRcdGxhYmVsOiAnRGVzY3JpcHRpb24nXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG5hbWU6ICdwcm9maWxlRGVzY3JpcHRpb24nLFxuXHRcdFx0XHRsYWJlbDogJ1Byb2ZpbGUnXG5cdFx0XHR9XSxcblx0XHRcdGl0ZW1DbGljazogZnVuY3Rpb24oaXRlbSkge1xuXHRcdFx0XHQkUUpIZWxwZXJGdW5jdGlvbnMuY2hhbmdlU3RhdGUoJ21vZHVsZS11c2VyZ3JvdXAtZWRpdCcsIHtcblx0XHRcdFx0XHRpZDogaXRlbS5faWRcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSwgJHNjb3BlKTtcblx0fVxuXG5cblx0Ly9Mb2FkIGNvbnRyb2xzIHdoZW4gY3VycmVudCBpdGVtIGl0cyBhdmFsaWFibGUuXG5cdHZhciBjb250cm9sc0xvYWRlZCA9IGZhbHNlO1xuXHQkcm9vdFNjb3BlLiRvbignY3VycmVudFVzZXIuY2hhbmdlJywgZnVuY3Rpb24oKSB7XG5cdFx0bG9hZENvbnRyb2xzKCk7XG5cdFx0Y29udHJvbHNMb2FkZWQgPSB0cnVlO1xuXHR9KTtcblx0aWYgKCFjb250cm9sc0xvYWRlZCAmJiAhXy5pc1VuZGVmaW5lZCgkcm9vdFNjb3BlLmN1cnJlbnRVc2VyKSkge1xuXHRcdGxvYWRDb250cm9scygpO1xuXHRcdGNvbnRyb2xzTG9hZGVkID0gdHJ1ZTtcblx0fVxuXHQvL2RlZmF1bHRzXG5cdCR0aW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdCRzY29wZS5maWx0ZXIuZmlsdGVyKCk7XG5cdH0sIDIwMDApO1xufSlcblxubW9kdWxlLmNvbnRyb2xsZXIoJ1VzZXJncm91cEVkaXRDb250cm9sbGVyJywgZnVuY3Rpb24oXG5cdCRRSkNDb21ib2JveCwgJFFKQ1NlbGVjdGtleSwgJFFKQ0xpc3R2aWV3LCAkUUpDRmlsdGVyLCAkUUpMb2dnZXIsICRRSkhlbHBlckZ1bmN0aW9ucywgJHNjb3BlLCAkcm9vdFNjb3BlLCAkUUpMb2dpbk1vZHVsZSwgJFFKQXBpLCAkdGltZW91dCwgJHN0YXRlLCAkUUpMb2dpbk1vZHVsZVxuKSB7XG5cblx0JFFKTG9nZ2VyLmxvZyhcIlVzZXJncm91cEVkaXRDb250cm9sbGVyIC0+IGluaXRpYWxpemVkXCIpO1xuXHQkc2NvcGUuYnJlYWRjcnVtYiA9IHtcblx0XHRuYW1lOiAnVXNlcmdyb3VwIEVkaXQnLFxuXHRcdGxpc3Q6IFt7XG5cdFx0XHRuYW1lOiBcIlVzZXJncm91cHNcIixcblx0XHRcdHN0YXRlOiAnbW9kdWxlLXVzZXJncm91cC1saXN0Jyxcblx0XHRcdC8vZmE6ICdmYS1kYXNoYm9hcmQnXG5cdFx0fSwgXSxcblx0XHRhY3RpdmU6IFwiTG9hZGluZy4uLlwiXG5cdH07XG5cblxuXG5cdHZhciBfaWQgPSAkc3RhdGUucGFyYW1zLmlkO1xuXG5cdCRzY29wZS5jcnVkID0ge1xuXHRcdGVycm9yczogW11cblx0fVxuXG5cdGZ1bmN0aW9uIHNob3dFcnJvcihlcnJvcikge1xuXHRcdCRzY29wZS5jcnVkLmVycm9ycy5wdXNoKGVycm9yKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGZvcm1IYXNFcnJvcnMoKSB7XG5cdFx0JHNjb3BlLmNydWQuZXJyb3JzID0gW107XG5cdFx0dmFyIGhhc0Vycm9ycyA9IGZhbHNlO1xuXHRcdGlmIChfLmlzVW5kZWZpbmVkKCRzY29wZS5pdGVtLmRlc2NyaXB0aW9uKSB8fCAkc2NvcGUuaXRlbS5kZXNjcmlwdGlvbiA9PSAnJykge1xuXHRcdFx0aGFzRXJyb3JzID0gc2hvd0Vycm9yKCdEZXNjcmlwdGlvbiByZXF1aXJlZCcpO1xuXHRcdH1cblx0XHRpZiAoXy5pc1VuZGVmaW5lZCgkc2NvcGUuaXRlbS5faWRfcHJvZmlsZSkgfHwgJHNjb3BlLml0ZW0uX2lkX3Byb2ZpbGUgPT0gJycpIHtcblx0XHRcdGhhc0Vycm9ycyA9IHNob3dFcnJvcignUHJvZmlsZSByZXF1aXJlZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gaGFzRXJyb3JzO1xuXHR9XG5cblx0JHNjb3BlLnNhdmUgPSBmdW5jdGlvbigpIHtcblx0XHRpZiAoIWZvcm1IYXNFcnJvcnMoKSkge1xuXHRcdFx0JFFKQXBpLmdldENvbnRyb2xsZXIoJ3VzZXJncm91cCcpLnBvc3Qoe1xuXHRcdFx0XHRhY3Rpb246ICdzYXZlJ1xuXHRcdFx0fSwgJHNjb3BlLml0ZW0sIGZ1bmN0aW9uKHJlcykge1xuXHRcdFx0XHQkUUpMb2dnZXIubG9nKFwiVXNlcmdyb3VwRWRpdENvbnRyb2xsZXIgLT4gYXBpIHBvc3QgLT4gc2F2ZSAtPiBzdWNjZXNzXCIpO1xuXHRcdFx0XHQvL1xuXHRcdFx0XHRzaG93RXJyb3IoJ0NhbWJpb3MgZ3VhcmRhZG9zJyk7XG5cdFx0XHRcdCRRSkhlbHBlckZ1bmN0aW9ucy5jaGFuZ2VTdGF0ZSgnbW9kdWxlLXVzZXJncm91cC1saXN0Jywge30sIDUwMCk7XG5cdFx0XHR9KTtcblx0XHR9O1xuXHR9O1xuXHQkc2NvcGUuZGVsZXRlID0gZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHIgPSBjb25maXJtKFwiRGVsZXRlIFwiICsgJHNjb3BlLml0ZW0ubmFtZSArIFwiID9cIik7XG5cdFx0aWYgKHIgPT0gdHJ1ZSkge1xuXHRcdFx0JFFKQXBpLmdldENvbnRyb2xsZXIoJ3VzZXJncm91cCcpLnBvc3Qoe1xuXHRcdFx0XHRhY3Rpb246ICdkZWxldGUnXG5cdFx0XHR9LCAkc2NvcGUuaXRlbSwgZnVuY3Rpb24ocmVzKSB7XG5cdFx0XHRcdCRRSkxvZ2dlci5sb2coXCJVc2VyZ3JvdXBFZGl0Q29udHJvbGxlciAtPiBkZWxldGUgLT4gc3VjY2Vzc1wiKTtcblx0XHRcdFx0Ly9cblx0XHRcdFx0c2hvd0Vycm9yKCdDYW1iaW9zIGd1YXJkYWRvcycpO1xuXHRcdFx0XHRzaG93RXJyb3IoJHNjb3BlLml0ZW0uZGVzY3JpcHRpb24gKyAnIGVsaW1pbmFkbycpO1xuXHRcdFx0XHQvL1xuXHRcdFx0XHQkUUpIZWxwZXJGdW5jdGlvbnMuY2hhbmdlU3RhdGUoJ21vZHVsZS11c2VyZ3JvdXAtbGlzdCcsIHt9LCA1MDApO1xuXG5cdFx0XHRcdGNyZWF0ZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHt9XG5cdH1cblx0JHNjb3BlLmNhbmNlbCA9IGZ1bmN0aW9uKCkge1xuXHRcdCRRSkhlbHBlckZ1bmN0aW9ucy5jaGFuZ2VTdGF0ZSgnbW9kdWxlLXVzZXJncm91cC1saXN0Jyk7XG5cdH07XG5cblx0ZnVuY3Rpb24gbG9hZENvbnRyb2xzKCkge1xuXG5cdFx0Ly9jb21ib2JveFxuXHRcdCRRSkNDb21ib2JveC5jcmVhdGUoe1xuXHRcdFx0bmFtZTogJ3Byb2ZpbGVDQk8nLFxuXHRcdFx0bGFiZWw6IFwiUHJvZmlsZVwiLFxuXHRcdFx0Y29kZTogJHNjb3BlLml0ZW0uX2lkX3Byb2ZpbGUsXG5cdFx0XHRjb2RlX2NvcHl0bzogJ2l0ZW0uX2lkX3Byb2ZpbGUnLFxuXHRcdFx0YXBpOiB7XG5cdFx0XHRcdGNvbnRyb2xsZXI6ICdwcm9maWxlJyxcblx0XHRcdFx0cGFyYW1zOiB7XG5cdFx0XHRcdFx0YWN0aW9uOiAnY29tYm9ib3hfYWxsJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0sICRzY29wZSk7XG5cblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZSgpIHtcblx0XHQkUUpMb2dnZXIubG9nKFwiVXNlcmdyb3VwRWRpdENvbnRyb2xsZXIgLT4gY3JlYXRlIG5ldyFcIik7XG5cdFx0JHNjb3BlLml0ZW0gPSB7XG5cdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRfaWRfcHJvZmlsZTogJycsXG5cdFx0XHRfaWQ6IC0xXG5cdFx0fTtcblx0fVxuXHRpZiAoX2lkID09IC0xKSB7XG5cdFx0Ly9DUkVBVEVcblx0XHRjcmVhdGUoKTtcblx0XHRsb2FkQ29udHJvbHMoKTtcblx0fSBlbHNlIHtcblx0XHQvL0dFVCBTSU5HTEUgVVNFUlxuXHRcdCRRSkFwaS5nZXRDb250cm9sbGVyKCd1c2VyZ3JvdXAnKS5nZXQoe1xuXHRcdFx0YWN0aW9uOiAnc2luZ2xlJyxcblx0XHRcdGlkOiBfaWRcblx0XHR9LCBmdW5jdGlvbihyZXMpIHtcblx0XHRcdCRRSkxvZ2dlci5sb2coXCJVc2VyZ3JvdXBFZGl0Q29udHJvbGxlciAtPiBhcGkgZ2V0IC0+IHNpbmdsZSAtPiBzdWNjZXNzXCIpO1xuXHRcdFx0JHNjb3BlLml0ZW0gPSByZXMuaXRlbTtcblx0XHRcdCRzY29wZS5icmVhZGNydW1iLmFjdGl2ZSA9ICRzY29wZS5pdGVtLmRlc2NyaXB0aW9uO1xuXHRcdFx0bG9hZENvbnRyb2xzKCk7XG5cdFx0fSk7XG5cdH1cblxufSk7XG5cbjtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiaHRaa3g0XCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi5cXFxcY29udHJvbGxlcnNcXFxcbW9kLnVzZXJncm91cEN0cmwuanNcIixcIi8uLlxcXFxjb250cm9sbGVyc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBtb2R1bGUgPSByZXF1aXJlKCcuL19tb2R1bGVfaW5pdC5qcycpO1xubW9kdWxlLmNvbnRyb2xsZXIoJ1VzZXJMaXN0Q29udHJvbGxlcicsIGZ1bmN0aW9uKFxuICAgICRRSkNDb21ib2JveCwgJFFKQ1NlbGVjdGtleSwgJFFKQ0xpc3R2aWV3LCAkUUpDRmlsdGVyLCAkUUpMb2dnZXIsICRRSkhlbHBlckZ1bmN0aW9ucywgJHNjb3BlLCAkcm9vdFNjb3BlLCAkUUpMb2dpbk1vZHVsZSwgJFFKQXBpLCAkdGltZW91dCwgJHN0YXRlLCAkUUpMb2dpbk1vZHVsZVxuKSB7XG5cblxuXG4gICAgJFFKTG9nZ2VyLmxvZyhcIlVzZXJMaXN0Q29udHJvbGxlciAtPiBpbml0aWFsaXplZFwiKTtcblxuXG5cbiAgICAkc2NvcGUuYnJlYWRjcnVtYiA9IHtcbiAgICAgICAgbmFtZTogJ1VzZXJzJyxcbiAgICAgICAgbGlzdDogW1xuICAgICAgICAgICAgLy97bmFtZTpcIk5vbmUxXCIsc3RhdGU6J21vZHVsZS1wcm9qZWN0LWxpc3QnLGZhOidmYS1kYXNoYm9hcmQnfSxcbiAgICAgICAgICAgIC8ve25hbWU6J05vbmUyJyxzdGF0ZTonJyxmYTonZmEtZGFzaGJvYXJkJ31cbiAgICAgICAgXSxcbiAgICAgICAgYWN0aXZlOiBcIlVzZXJzXCJcbiAgICB9O1xuXG5cbiAgICAvL2NvbnNvbGUuaW5mbygkcm9vdFNjb3BlLmNvbmZpZyk7XG5cbiAgICAkc2NvcGUudXNlcnMgPSBbXTsgLy9ob2xkcyB1c2VycyBmcm9tIGRiXG4gICAgJHNjb3BlLnVzZXJzRGF0YSA9IG51bGw7IC8vaG9sZHMgdXNlcnMgZGl2aWRlZCBwZXIgcGFnZVxuXG4gICAgLy9maWx0ZXJcbiAgICAkUUpDRmlsdGVyLmNyZWF0ZSh7XG4gICAgICAgIG5hbWU6ICd1c2Vyc0ZpbHRlcicsXG4gICAgICAgIGZpZWxkczogW3tcbiAgICAgICAgICAgIG5hbWU6ICdsb2dpbm5hbWUnLFxuICAgICAgICAgICAgYXJyYXlOYW1lOiAndXNlcnMnLFxuICAgICAgICAgICAgYmluZFRvOiBbJ2xvZ2lubmFtZSddXG4gICAgICAgIH0sIHtcbiAgICAgICAgICAgIG5hbWU6ICd0ZXh0JyxcbiAgICAgICAgICAgIGFycmF5TmFtZTogJ3VzZXJzJyxcbiAgICAgICAgICAgIGJpbmRUbzogWydmaXJzdF9uYW1lJywgJ2xhc3RfbmFtZSddXG4gICAgICAgIH0sIHtcbiAgICAgICAgICAgIG5hbWU6ICdfdXNlcmdyb3VwX2lkJyxcbiAgICAgICAgICAgIGFycmF5TmFtZTogJ3VzZXJzJyxcbiAgICAgICAgICAgIGJpbmRUbzogWydfdXNlcmdyb3VwX2lkJ11cbiAgICAgICAgfV1cbiAgICB9LCAkc2NvcGUpO1xuXG4gICAgLypcbiAgICAvL3NlbGVjdGtleVxuICAgICRRSkNTZWxlY3RrZXkuY3JlYXRlKHtcbiAgICAgICAgbmFtZTogJ3VzZXJzVXNlcmdyb3VwU0xLJyxcbiAgICAgICAgbGFiZWw6IFwiVXNlcmdyb3VwXCIsXG4gICAgICAgIGNvZGU6IDcsXG4gICAgICAgIHRleHQ6IFwiTm8gZGlzcG9uaWJsZVwiLFxuICAgICAgICBjb2RlX2NvcHl0bzogJ3VzZXJzRmlsdGVyLmZpZWxkcy5fdXNlcmdyb3VwX2lkJyxcbiAgICAgICAgc2VhcmNoOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnZ3J1cG8gZGUgdXN1YXJpbyBsaWNrJylcbiAgICAgICAgfVxuICAgIH0sICRzY29wZSk7XG4qL1xuXG4gICAgZnVuY3Rpb24gbG9hZENvbnRyb2xzKCkge1xuXG5cbiAgICAgICAgLy9jb21ib2JveFxuICAgICAgICAkUUpDQ29tYm9ib3guY3JlYXRlKHtcbiAgICAgICAgICAgIG5hbWU6ICd1c2Vyc1VzZXJncm91cENCTycsXG4gICAgICAgICAgICBsYWJlbDogXCJVc2VyZ3JvdXBcIixcbiAgICAgICAgICAgIGNvZGU6IC0xLCAvLyRyb290U2NvcGUuY3VycmVudFVzZXIuX2dyb3VwX2lkLFxuICAgICAgICAgICAgY29kZV9jb3B5dG86ICd1c2Vyc0ZpbHRlci5maWVsZHMuX3VzZXJncm91cF9pZCcsXG4gICAgICAgICAgICBhcGk6IHtcbiAgICAgICAgICAgICAgICBjb250cm9sbGVyOiAndXNlcmdyb3VwJyxcbiAgICAgICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiAnY29tYm9ib3gnXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSwgJHNjb3BlKTtcbiAgICAgICAgLy9saXN0dmlld1xuICAgICAgICAkUUpDTGlzdHZpZXcuY3JlYXRlKHtcbiAgICAgICAgICAgIG5hbWU6ICd1c2Vyc0xWVycsXG4gICAgICAgICAgICBkYXRhQXJyYXk6ICd1c2VycycsXG4gICAgICAgICAgICBwYWdlZERhdGFBcnJheTogJ3VzZXJzRGF0YScsXG4gICAgICAgICAgICBhcGk6IHtcbiAgICAgICAgICAgICAgICBjb250cm9sbGVyOiAndXNlcicsXG4gICAgICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbjogJ2FsbCdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY29sdW1uczogW3tcbiAgICAgICAgICAgICAgICBuYW1lOiAnbG9naW5uYW1lJyxcbiAgICAgICAgICAgICAgICBsYWJlbDogJ1VzZXJuYW1lJ1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdmaXJzdF9uYW1lJyxcbiAgICAgICAgICAgICAgICBsYWJlbDogJ0ZpcnN0IG5hbWUnXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2xhc3RfbmFtZScsXG4gICAgICAgICAgICAgICAgbGFiZWw6ICdMYXN0IG5hbWUnXG4gICAgICAgICAgICB9XSxcbiAgICAgICAgICAgIGl0ZW1DbGljazogZnVuY3Rpb24oaXRlbSkge1xuICAgICAgICAgICAgICAgICRRSkhlbHBlckZ1bmN0aW9ucy5jaGFuZ2VTdGF0ZSgnbW9kdWxlLXVzZXItZWRpdCcsIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IGl0ZW0uX2lkXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sICRzY29wZSk7XG4gICAgfVxuXG5cbiAgICAvL0xvYWQgY29udHJvbHMgd2hlbiBjdXJyZW50IHVzZXIgaXRzIGF2YWxpYWJsZS5cbiAgICB2YXIgY29udHJvbHNMb2FkZWQgPSBmYWxzZTtcbiAgICAkcm9vdFNjb3BlLiRvbignY3VycmVudFVzZXIuY2hhbmdlJywgZnVuY3Rpb24oKSB7XG4gICAgICAgIGxvYWRDb250cm9scygpO1xuICAgICAgICBjb250cm9sc0xvYWRlZCA9IHRydWU7XG4gICAgfSk7XG4gICAgaWYgKCFjb250cm9sc0xvYWRlZCAmJiAhXy5pc1VuZGVmaW5lZCgkcm9vdFNjb3BlLmN1cnJlbnRVc2VyKSkge1xuICAgICAgICBsb2FkQ29udHJvbHMoKTtcbiAgICAgICAgY29udHJvbHNMb2FkZWQgPSB0cnVlO1xuICAgIH1cblxuXG4gICAgLy9kZWZhdWx0c1xuICAgICR0aW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAkc2NvcGUudXNlcnNGaWx0ZXIuZmlsdGVyKCk7XG4gICAgfSwgMjAwMCk7XG59KVxuXG5cblxubW9kdWxlLmNvbnRyb2xsZXIoJ1VzZXJFZGl0Q29udHJvbGxlcicsIGZ1bmN0aW9uKFxuICAgICRRSkNDb21ib2JveCwgJFFKTG9nZ2VyLCAkUUpIZWxwZXJGdW5jdGlvbnMsICRzY29wZSwgJHJvb3RTY29wZSwgJFFKTG9naW5Nb2R1bGUsICRRSkFwaSwgJHRpbWVvdXQsICRzdGF0ZSwgJFFKTG9naW5Nb2R1bGVcbikge1xuICAgICRRSkxvZ2dlci5sb2coXCJVc2VyRWRpdENvbnRyb2xsZXIgLT4gaW5pdGlhbGl6ZWRcIik7XG5cblxuICAgICRzY29wZS5icmVhZGNydW1iID0ge1xuICAgICAgICBuYW1lOiAnVXNlcicsXG4gICAgICAgIGxpc3Q6IFt7XG4gICAgICAgICAgICBuYW1lOiBcIlVzZXJzXCIsXG4gICAgICAgICAgICBzdGF0ZTogJ21vZHVsZS11c2VyLWxpc3QnLFxuICAgICAgICAgICAgLy9mYTogJ2ZhLWRhc2hib2FyZCdcbiAgICAgICAgfSwgXSxcbiAgICAgICAgYWN0aXZlOiAnTG9hZGluZy4uLidcbiAgICB9O1xuXG5cbiAgICB2YXIgX3VzZXJfaWQgPSAkc3RhdGUucGFyYW1zLmlkO1xuXG4gICAgJHNjb3BlLmNydWQgPSB7XG4gICAgICAgIGVycm9yczogW11cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzaG93RXJyb3IoZXJyb3IpIHtcbiAgICAgICAgJHNjb3BlLmNydWQuZXJyb3JzLnB1c2goZXJyb3IpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmb3JtSGFzRXJyb3JzKCkge1xuICAgICAgICAkc2NvcGUuY3J1ZC5lcnJvcnMgPSBbXTtcbiAgICAgICAgdmFyIGhhc0Vycm9ycyA9IGZhbHNlO1xuICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZCgkc2NvcGUuaXRlbS5sb2dpbm5hbWUpIHx8ICRzY29wZS5pdGVtLmxvZ2lubmFtZSA9PSAnJykge1xuICAgICAgICAgICAgaGFzRXJyb3JzID0gc2hvd0Vycm9yKCdVc2VybmFtZSByZXF1aXJlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChfLmlzVW5kZWZpbmVkKCRzY29wZS5pdGVtLmZpcnN0X25hbWUpIHx8ICRzY29wZS5pdGVtLmZpcnN0X25hbWUgPT0gJycpIHtcbiAgICAgICAgICAgIGhhc0Vycm9ycyA9IHNob3dFcnJvcignRmlyc3QgbmFtZSByZXF1aXJlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChfLmlzVW5kZWZpbmVkKCRzY29wZS5pdGVtLmxhc3RfbmFtZSkgfHwgJHNjb3BlLml0ZW0ubGFzdF9uYW1lID09ICcnKSB7XG4gICAgICAgICAgICBoYXNFcnJvcnMgPSBzaG93RXJyb3IoJ0xhc3QgbmFtZSByZXF1aXJlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChfLmlzVW5kZWZpbmVkKCRzY29wZS5pdGVtLl91c2VyZ3JvdXBfaWQpIHx8ICRzY29wZS5pdGVtLl91c2VyZ3JvdXBfaWQgPT0gJycpIHtcbiAgICAgICAgICAgIGhhc0Vycm9ycyA9IHNob3dFcnJvcignVXNlcmdyb3VwIHJlcXVpcmVkJyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGhhc0Vycm9ycztcbiAgICB9XG5cbiAgICAkc2NvcGUuc2F2ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAoIWZvcm1IYXNFcnJvcnMoKSkge1xuICAgICAgICAgICAgLy9jb25zb2xlLmluZm8oJ1NhbHZhbmRvIScpO1xuICAgICAgICAgICAgJFFKQXBpLmdldENvbnRyb2xsZXIoJ3VzZXInKS5wb3N0KHtcbiAgICAgICAgICAgICAgICBhY3Rpb246ICdzYXZlJ1xuICAgICAgICAgICAgfSwgJHNjb3BlLml0ZW0sIGZ1bmN0aW9uKHJlcykge1xuICAgICAgICAgICAgICAgICRRSkxvZ2dlci5sb2coXCJVc2VyRWRpdENvbnRyb2xsZXIgLT4gdXNlciAtPiBhcGkgcG9zdCAtPiB1c2VyIHNhdmUgLT4gc3VjY2Vzc1wiKTtcbiAgICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAgIHNob3dFcnJvcignQ2FtYmlvcyBndWFyZGFkb3MnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuICAgIH07XG4gICAgJHNjb3BlLmNhbmNlbCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAkUUpIZWxwZXJGdW5jdGlvbnMuY2hhbmdlU3RhdGUoJ21vZHVsZS11c2VyLWxpc3QnKTtcbiAgICB9O1xuICAgICRzY29wZS5kZWxldGUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHIgPSBjb25maXJtKFwiRGVsZXRlIFwiICsgJHNjb3BlLml0ZW0ubG9naW5uYW1lICsgXCIgP1wiKTtcbiAgICAgICAgaWYgKHIgPT0gdHJ1ZSkge1xuICAgICAgICAgICAgJFFKQXBpLmdldENvbnRyb2xsZXIoJ3VzZXInKS5wb3N0KHtcbiAgICAgICAgICAgICAgICBhY3Rpb246ICdkZWxldGUnXG4gICAgICAgICAgICB9LCAkc2NvcGUuaXRlbSwgZnVuY3Rpb24ocmVzKSB7XG4gICAgICAgICAgICAgICAgJFFKTG9nZ2VyLmxvZyhcIlVzZXJFZGl0Q29udHJvbGxlciAtPiB1c2VyIC0+IGFwaSBwb3N0IC0+IHVzZXIgZGVsZXRlIC0+IHN1Y2Nlc3NcIik7XG4gICAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgICBzaG93RXJyb3IoJ0NhbWJpb3MgZ3VhcmRhZG9zJyk7XG4gICAgICAgICAgICAgICAgc2hvd0Vycm9yKCRzY29wZS5pdGVtLmxvZ2lubmFtZSArICcgZWxpbWluYWRvJyk7XG4gICAgICAgICAgICAgICAgY3JlYXRlKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHt9XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBjcmVhdGUoKSB7XG4gICAgICAgICRzY29wZS5pdGVtID0ge1xuICAgICAgICAgICAgbG9naW5uYW1lOiAnJyxcbiAgICAgICAgICAgIGZpcnN0X25hbWU6ICcnLFxuICAgICAgICAgICAgbGFzdF9uYW1lOiAnJyxcbiAgICAgICAgICAgIHBhc3N3b3JkOiAnJyxcbiAgICAgICAgICAgIF91c2VyZ3JvdXBfaWQ6ICRzY29wZS5pdGVtLl91c2VyZ3JvdXBfaWQgfHwgJycsXG4gICAgICAgICAgICBfaWQ6IC0xXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbG9hZENvbnRyb2xzKCkge1xuXG4gICAgICAgIC8vY29tYm9ib3ggb25seSBpdGVtcyB3aG8gdXNlciBoYXMgYWNjZXNzXG4gICAgICAgICRRSkNDb21ib2JveC5jcmVhdGUoe1xuICAgICAgICAgICAgbmFtZTogJ3VzZXJFZGl0VXNlcmdyb3VwQWNjZXNzQ0JPJyxcbiAgICAgICAgICAgIGxhYmVsOiBcIlVzZXJncm91cFwiLFxuICAgICAgICAgICAgY29kZTogJHNjb3BlLml0ZW0uX3VzZXJncm91cF9pZCxcbiAgICAgICAgICAgIGRpc2FibGVkOnRydWUsXG4gICAgICAgICAgICBjb2RlX2NvcHl0bzogJ2l0ZW0uX3VzZXJncm91cF9pZCcsXG4gICAgICAgICAgICBhcGk6IHtcbiAgICAgICAgICAgICAgICBjb250cm9sbGVyOiAndXNlcmdyb3VwJyxcbiAgICAgICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiAnY29tYm9ib3hfYWNjZXNzJ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sICRzY29wZSk7XG5cblxuICAgICAgICAvL2NvbWJvYm94XG4gICAgICAgICRRSkNDb21ib2JveC5jcmVhdGUoe1xuICAgICAgICAgICAgbmFtZTogJ3VzZXJFZGl0VXNlcmdyb3VwQ0JPJyxcbiAgICAgICAgICAgIGxhYmVsOiBcIlVzZXJncm91cFwiLFxuICAgICAgICAgICAgY29kZTogJHNjb3BlLml0ZW0uX3VzZXJncm91cF9pZCxcbiAgICAgICAgICAgIGNvZGVfY29weXRvOiAnaXRlbS5fdXNlcmdyb3VwX2lkJyxcbiAgICAgICAgICAgIGFwaToge1xuICAgICAgICAgICAgICAgIGNvbnRyb2xsZXI6ICd1c2VyZ3JvdXAnLFxuICAgICAgICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb246ICdjb21ib2JveCdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LCAkc2NvcGUpO1xuICAgIH1cblxuICAgIGlmIChfdXNlcl9pZCA9PSAtMSkge1xuICAgICAgICAvL0NSRUFURVxuICAgICAgICBjcmVhdGUoKTtcbiAgICAgICAgbG9hZENvbnRyb2xzKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy9VUERBVEVcbiAgICAgICAgJFFKQXBpLmdldENvbnRyb2xsZXIoJ3VzZXInKS5nZXQoe1xuICAgICAgICAgICAgYWN0aW9uOiAnc2luZ2xlJyxcbiAgICAgICAgICAgIGlkOiBfdXNlcl9pZFxuICAgICAgICB9LCBmdW5jdGlvbihyZXMpIHtcbiAgICAgICAgICAgICRRSkxvZ2dlci5sb2coXCJVc2VyRWRpdENvbnRyb2xsZXIgLT4gdXNlciAtPiBhcGkgZ2V0IC0+IHVzZXIgc2luZ2xlIC0+IHN1Y2Nlc3NcIik7XG4gICAgICAgICAgICAkc2NvcGUuaXRlbSA9IHJlcy51c2VyO1xuICAgICAgICAgICAgJHNjb3BlLmJyZWFkY3J1bWIuYWN0aXZlID0gJHNjb3BlLml0ZW0ubG9naW5uYW1lO1xuICAgICAgICAgICAgbG9hZENvbnRyb2xzKCk7XG4gICAgICAgIH0pO1xuXG4gICAgfVxuXG5cblxufSk7XG5cblxuO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJodFpreDRcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLlxcXFxjb250cm9sbGVyc1xcXFxtb2QudXNlcnNDdHJsLmpzXCIsXCIvLi5cXFxcY29udHJvbGxlcnNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgbW9kdWxlID0gcmVxdWlyZSgnLi9fbW9kdWxlX2luaXQuanMnKTtcbm1vZHVsZS5jb250cm9sbGVyKCdOYXZDb250cm9sbGVyJywgZnVuY3Rpb24oXG5cdCRRSkxvZ2dlciwgJFFKSGVscGVyRnVuY3Rpb25zLCAkUUpBcGksXG5cdCRzY29wZSwgJHJvb3RTY29wZSwgJFFKTG9naW5Nb2R1bGUsICRRSkxvY2FsU2Vzc2lvbiwgJFFKQ29uZmlnKSB7XG5cdCRRSkxvZ2dlci5sb2coXCJOYXZDb250cm9sbGVyIC0+IGluaXRpYWxpemVkXCIpO1xuXG5cdC8vU2llbXByZSBxdWUgZW50cmEgYWwgaG9tZSByZWN1cGVyYSBsb3MgZGF0b3MgZGVsIHVzdWFyaW8gYWN0dWFsIHkgbG9zIHNldGVhIGdsb2JhbG1lbnRlIGVuIGVsIHJvb3RTY29wZS5cblx0JFFKQXBpLmdldENvbnRyb2xsZXIoJ3VzZXInKS5nZXQoe1xuXHRcdGFjdGlvbjogJ2N1cnJlbnQnXG5cdH0sIGZ1bmN0aW9uKHJlcykge1xuXHRcdCRRSkxvZ2dlci5sb2coXCJIb21lQ29udHJvbGxlciAtPiB1c2VyIC0+IGFwaSBnZXQgLT4gdXNlciBzaW5nbGUgLT4gc3VjY2Vzc1wiKTtcblx0XHQkcm9vdFNjb3BlLmN1cnJlbnRVc2VyID0gcmVzLnVzZXI7XG5cdFx0JHJvb3RTY29wZS5zZXNzaW9uLnVzZXIgPSByZXMudXNlcjtcblx0XHQkcm9vdFNjb3BlLiRlbWl0KCdjdXJyZW50VXNlci5jaGFuZ2UnKTtcblx0XHQvL2NvbnNvbGUuaW5mbyhyZXMpO1xuXG5cblxuXHR9KTtcblxuXHQkc2NvcGUuc2lnbm91dCA9IGZ1bmN0aW9uKCkge1xuXHRcdCRyb290U2NvcGUuc2Vzc2lvbi50b2tlbiA9IG51bGw7XG5cdFx0c3RvcmUuY2xlYXIoKTtcblx0XHQkUUpIZWxwZXJGdW5jdGlvbnMuY2hhbmdlU3RhdGUoJ2xvZ2luJyk7XG5cdFx0JFFKTG9nZ2VyLmxvZyhcIk5hdkNvbnRyb2xsZXIgLT4gc2lnbm91dCAtPiBhdCBcIiArIG5ldyBEYXRlKCkpO1xuXHR9XG59KTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiaHRaa3g0XCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi5cXFxcY29udHJvbGxlcnNcXFxcbmF2Q3RybC5qc1wiLFwiLy4uXFxcXGNvbnRyb2xsZXJzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIG1vZHVsZSA9IHJlcXVpcmUoJy4vX21vZHVsZV9pbml0LmpzJyk7XG5tb2R1bGUuY29udHJvbGxlcignUUpCYWNrZW5kU2V0dGluZ3NDb250cm9sbGVyJywgZnVuY3Rpb24oXG5cdCRRSkF1dGgsICRRSkNDb21ib2JveCwgJFFKTG9nZ2VyLCAkUUpIZWxwZXJGdW5jdGlvbnMsICRzY29wZSwgJHJvb3RTY29wZSwgJFFKTG9naW5Nb2R1bGUsICRRSkFwaSwgJHRpbWVvdXQsICRzdGF0ZSwgJFFKTG9naW5Nb2R1bGVcbikge1xuXHQkUUpMb2dnZXIubG9nKFwiUUpCYWNrZW5kU2V0dGluZ3NDb250cm9sbGVyIC0+IGluaXRpYWxpemVkXCIpO1xuXG5cblx0JHNjb3BlLmJyZWFkY3J1bWIgPSB7XG5cdFx0bmFtZTogJ1NldHRpbmdzJyxcblx0XHRsaXN0OiBbXG5cdFx0XHQvL3tuYW1lOidOb25lMicsc3RhdGU6JycsZmE6J2ZhLWRhc2hib2FyZCd9XG5cdFx0XSxcblx0XHRhY3RpdmU6IFwiU2V0dGluZ3NcIlxuXHR9O1xuXG5cdGZ1bmN0aW9uIGxvYWRDb250cm9scygpIHtcblx0XHQvL2NvbWJvYm94XG5cdFx0JFFKQ0NvbWJvYm94LmNyZWF0ZSh7XG5cdFx0XHRuYW1lOiAnY29uZmlnR3JvdXBDQk8nLFxuXHRcdFx0bGFiZWw6IFwiR3J1cG8gZGUgaW1wbGVtZW50YWNpb25cIixcblx0XHRcdGNvZGU6ICRzY29wZS5zdGF0cy5fZ3JvdXBfaWQsXG5cdFx0XHQvL2NvZGVfY29weXRvOiAndXNlcnNGaWx0ZXIuZmllbGRzLl91c2VyZ3JvdXBfaWQnLFxuXHRcdFx0YXBpOiB7XG5cdFx0XHRcdGNvbnRyb2xsZXI6ICdncm91cCcsXG5cdFx0XHRcdHBhcmFtczoge1xuXHRcdFx0XHRcdGFjdGlvbjogJ2NvbWJvYm94X2Fzc29jJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0sICRzY29wZSk7XG5cdH1cblxuXHRmdW5jdGlvbiBvblRva2VuVXBkYXRlKGNhbGxiYWNrKSB7XG5cdFx0JFFKQXBpLmdldENvbnRyb2xsZXIoJ3VzZXInKS5nZXQoe1xuXHRcdFx0YWN0aW9uOiAnY3VycmVudCdcblx0XHR9LCBmdW5jdGlvbihyZXMpIHtcblx0XHRcdCRRSkxvZ2dlci5sb2coXCJIb21lQ29udHJvbGxlciAtPiB1c2VyIC0+IGN1cnJlbnQgIC0+IHN1Y2Nlc3NcIik7XG5cdFx0XHQkc2NvcGUuc3RhdHMgPSByZXMudXNlcjtcblx0XHRcdC8vY29uc29sZS5pbmZvKHJlcyk7XG5cdFx0XHRjYWxsYmFjaygpO1xuXHRcdH0pO1xuXHR9XG5cdCRyb290U2NvcGUuJG9uKCdzZXNzaW9uLmNoYW5nZScsIGZ1bmN0aW9uKCkge1xuXHRcdG9uVG9rZW5VcGRhdGUoZnVuY3Rpb24oKSB7fSk7XG5cdH0pO1xuXHRvblRva2VuVXBkYXRlKGZ1bmN0aW9uKCkge1xuXHRcdGxvYWRDb250cm9scygpO1xuXHR9KTtcblxuXG5cdCRzY29wZS4kb24oJ2NvbmZpZ0dyb3VwQ0JPLmNoYW5nZScsIGZ1bmN0aW9uKGFyZ3MxLCBhcmdzMikge1xuXHRcdGlmIChhcmdzMi5zZWxlY3RlZFZhbHVlICE9PSAtMSAmJiBhcmdzMi5zZWxlY3RlZFZhbHVlICE9PSAkc2NvcGUuc3RhdHMuX2dyb3VwX2lkKSB7XG5cdFx0XHRjb25zb2xlLmluZm8oJ2NoYW5naW5nIGltcGwnKTtcblx0XHRcdCRRSkFwaS5nZXRDb250cm9sbGVyKCdhdXRoJykucG9zdCh7XG5cdFx0XHRcdGFjdGlvbjogJ2NoYW5nZWdyb3VwJ1xuXHRcdFx0fSwge1xuXHRcdFx0XHRfZ3JvdXBfaWQ6IGFyZ3MyLnNlbGVjdGVkVmFsdWVcblx0XHRcdH0sIGZ1bmN0aW9uKHJlcykge1xuXHRcdFx0XHQkUUpMb2dnZXIubG9nKFwiSG9tZUNvbnRyb2xsZXIgLT4gYXV0aCAtPiBjaGFuZ2Vncm91cCAgLT4gc3VjY2Vzc1wiKTtcblx0XHRcdFx0JFFKQXV0aC51cGRhdGVTZXNzaW9uQ3VzdG9tKHJlcy50b2tlbiwgYXJnczIuc2VsZWN0ZWRWYWx1ZSk7XG5cdFx0XHR9KTtcblxuXHRcdH1cblx0fSk7XG5cbn0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJodFpreDRcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLlxcXFxjb250cm9sbGVyc1xcXFxzZXR0aW5nc0N0cmwuanNcIixcIi8uLlxcXFxjb250cm9sbGVyc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBtb2R1bGUgPSByZXF1aXJlKCcuL19tb2R1bGVfaW5pdC5qcycpO1xubW9kdWxlLmNvbnRyb2xsZXIoJ1NpZGViYXJDb250cm9sbGVyJywgZnVuY3Rpb24oXG4gICAgJFFKTG9nZ2VyLCAkc2NvcGUsICRyb290U2NvcGUsICRRSkxvZ2luTW9kdWxlLCAkUUpMb2NhbFNlc3Npb24sICRRSkNvbmZpZywgJFFKQXBpKSB7XG4gICAgJFFKTG9nZ2VyLmxvZyhcIlNpZGViYXJDb250cm9sbGVyIC0+IGluaXRpYWxpemVkXCIpO1xuXG4gICAgZnVuY3Rpb24gZ2V0Tm9kZXNGb3JDdXJyZW50VG9rZW4oKSB7XG4gICAgICAgIC8vU2llbXByZSBxdWUgY2FyZ2EgZWwgc2lkZWJhciByZWN1cGVyYSBlbCBtZW51IHBhcmEgZWwgdXN1YXJpb1xuICAgICAgICAkUUpBcGkuZ2V0Q29udHJvbGxlcignbW9kdWxlJykuZ2V0KHtcbiAgICAgICAgICAgIGFjdGlvbjogJ21lbnUnXG4gICAgICAgIH0sIGZ1bmN0aW9uKHJlcykge1xuICAgICAgICAgICAgJFFKTG9nZ2VyLmxvZyhcIlNpZGViYXJDb250cm9sbGVyIC0+IGFwaSBnZXQgLT4gbW9kdWxlIG1lbnUgLT4gc3VjY2Vzc1wiKTtcbiAgICAgICAgICAgIC8vY29uc29sZS5pbmZvKHJlcyk7XG4gICAgICAgICAgICAkc2NvcGUubW9kdWxlcyA9IHJlcy5tb2R1bGVzO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAkcm9vdFNjb3BlLiRvbignc2Vzc2lvbi5jaGFuZ2UnLCBmdW5jdGlvbihhcmdzMSwgYXJnczIpIHtcbiAgICAgICAgZ2V0Tm9kZXNGb3JDdXJyZW50VG9rZW4oKTtcbiAgICB9KTtcblxuICAgIGdldE5vZGVzRm9yQ3VycmVudFRva2VuKCk7XG59KTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiaHRaa3g0XCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi5cXFxcY29udHJvbGxlcnNcXFxcc2lkZWJhckN0cmwuanNcIixcIi8uLlxcXFxjb250cm9sbGVyc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBtb2R1bGUgPSByZXF1aXJlKCcuL19tb2R1bGVfaW5pdC5qcycpO1xubW9kdWxlLmNvbnRyb2xsZXIoJ1ZpcHN0ZXJDb25maWdDb250cm9sbGVyJywgZnVuY3Rpb24oXG4gICAgJFFKQ0NvbWJvYm94LCAkUUpDU2VsZWN0a2V5LCAkUUpDTGlzdHZpZXcsICRRSkNGaWx0ZXIsICRRSkxvZ2dlclxuICAgICwgJFFKSGVscGVyRnVuY3Rpb25zLCAkc2NvcGUsICRyb290U2NvcGUsICRRSkxvZ2luTW9kdWxlLCAkUUpBcGksICR0aW1lb3V0LCAkc3RhdGUsICRRSkxvZ2luTW9kdWxlXG4pIHtcbiAgICAkUUpMb2dnZXIubG9nKFwiVmlwc3RlckNvbmZpZ0NvbnRyb2xsZXIgLT4gaW5pdGlhbGl6ZWRcIik7XG5cblxufSk7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiaHRaa3g0XCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi5cXFxcY29udHJvbGxlcnNcXFxcdnAuY29uZmlnQ3RybC5qc1wiLFwiLy4uXFxcXGNvbnRyb2xsZXJzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xubW9kdWxlLmV4cG9ydHMgPSBhbmd1bGFyLm1vZHVsZSgnYXBwLmNvbnRyb2xzJywgW10pO1xucmVxdWlyZSgnLi9xamNvbWJvYm94Q3RybC5qcycpO1xucmVxdWlyZSgnLi9xamZpbHRlckN0cmwuanMnKTtcbnJlcXVpcmUoJy4vcWpsaXN0dmlld0N0cmwuanMnKTtcbnJlcXVpcmUoJy4vcWpzZWxlY3RrZXlDdHJsLmpzJyk7XG5yZXF1aXJlKCcuL3FqdGltZXJjb3VudGVyQ3RybC5qcycpO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJodFpreDRcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLlxcXFxjb250cm9sc1xcXFxfbW9kdWxlX2luaXQuanNcIixcIi8uLlxcXFxjb250cm9sc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBtb2R1bGUgPSByZXF1aXJlKCcuL19tb2R1bGVfaW5pdC5qcycpO1xubW9kdWxlLmZhY3RvcnkoJyRRSkNDb21ib2JveCcsIFtcblx0JyRRSkFwaScsICckUUpIZWxwZXJGdW5jdGlvbnMnLCAnJFFKTG9nZ2VyJywgJyRyb290U2NvcGUnLCAnJHN0YXRlJywgJyR0aW1lb3V0JywgJyRRSkxvY2FsU2Vzc2lvbicsICckUUpBdXRoJyxcblx0ZnVuY3Rpb24oJFFKQXBpLCAkUUpIZWxwZXJGdW5jdGlvbnMsICRRSkxvZ2dlciwgJHJvb3RTY29wZSwgJHN0YXRlLCAkdGltZW91dCwgJFFKTG9jYWxTZXNzaW9uLCAkUUpBdXRoKSB7XG5cdFx0ZnVuY3Rpb24gc2Vla09iamVjdChmdWxsbmFtZSwgJHNjb3BlLCBvYmosIGluZGV4KSB7XG5cdFx0XHRpZiAoaW5kZXggPT0gMCkge1xuXHRcdFx0XHQkUUpMb2dnZXIubG9nKCdRSkNTZWxlY3RrZXkgLT4gc2Vla09iamVjdCAtPiBzb21ldGhpbmcgd2VudCB3cm9uZyBhbmQgaSBhYm9ydCB0aGUgcmVjdXJzaXZlIGZ1bmMgYnJvIScpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFfLmlzVW5kZWZpbmVkKG9iaikgJiYgXy5pc051bGwob2JqKSkge1xuXHRcdFx0XHRyZXR1cm4gb2JqO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZ1bGxuYW1lLnRvU3RyaW5nKCkuc3BsaXQoJy4nKS5sZW5ndGggPT0gMSB8fCBpbmRleCA9PSAwKSB7XG5cdFx0XHRcdGlmICghXy5pc1VuZGVmaW5lZChvYmopKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG9ialtmdWxsbmFtZV0gfHwgbnVsbDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gJHNjb3BlW2Z1bGxuYW1lXSB8fCBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhciBmaXJzdFBhcnQgPSBmdWxsbmFtZS50b1N0cmluZygpLnNwbGl0KCcuJylbMF07XG5cdFx0XHRcdHZhciByZXN0ID0gZnVsbG5hbWUuc3Vic3RyaW5nKGZpcnN0UGFydC5sZW5ndGggKyAxKTtcblx0XHRcdFx0Ly9jb25zb2xlLmxvZyhcIm9iaiAtPlwiK29iaik7XG5cdFx0XHRcdC8vY29uc29sZS5sb2coXCJmaXJzdHBhcnQtPlwiK2ZpcnN0UGFydCk7XG5cdFx0XHRcdC8vY29uc29sZS5sb2coXCJyZXN0LT5cIityZXN0KTtcblx0XHRcdFx0cmV0dXJuIHNlZWtPYmplY3QocmVzdCwgJHNjb3BlLCBvYmogIT0gbnVsbCA/IG9ialtmaXJzdFBhcnRdIDogJHNjb3BlW2ZpcnN0UGFydF0sIChfLmlzVW5kZWZpbmVkKGluZGV4KSA/IDIwIDogaW5kZXgtLSkpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNyZWF0ZTogZnVuY3Rpb24oc2V0dGluZ3MsICRzY29wZSkge1xuXG5cdFx0XHRcdC8qXG5cdFx0XHRcdGNvbnNvbGUuaW5mbygnUUpDQ29tYm9ib3ggLT4gIExPQUQgJ1xuXHRcdFx0XHRcdCsgJyBDT0RFWycrc2V0dGluZ3MuY29kZSsnXSdcblx0XHRcdFx0KTtcbiovXG5cblx0XHRcdFx0c2V0dGluZ3MuY29kZV9jb3B5dG8gPSBzZXR0aW5ncy5jb2RlX2NvcHl0byB8fCBudWxsO1xuXHRcdFx0XHRzZXR0aW5ncy5kZXNjcmlwdGlvbl9jb3B5dG8gPSBzZXR0aW5ncy5kZXNjcmlwdGlvbl9jb3B5dG8gfHwgbnVsbDtcblxuXG5cdFx0XHRcdHZhciBzZWxmID0gc2V0dGluZ3M7XG5cblx0XHRcdFx0c2VsZi5pbml0aWFsVmFsdWUgPSBzZXR0aW5ncy5jb2RlO1xuXHRcdFx0XHRzZWxmLnNlbGVjdGVkVmFsdWUgPSBzZWxmLnNlbGVjdGVkVmFsdWUgfHwgLTE7XG5cdFx0XHRcdHNlbGYuZGlzYWJsZWQgPSBzZWxmLmRpc2FibGVkIHx8IGZhbHNlO1xuXG5cdFx0XHRcdHNlbGYubmdTZWxlY3RlZCA9IGZ1bmN0aW9uKGl0ZW0pIHtcblx0XHRcdFx0XHRyZXR1cm4gaXRlbS5faWQgPT0gc2VsZi5pbml0aWFsVmFsdWU7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0JHNjb3BlW3NldHRpbmdzLm5hbWVdID0gc2VsZjsgLy9zZXRzIHRvIHRoZSBzY29wZSAhISEhXG5cblx0XHRcdFx0aWYgKHR5cGVvZiBjYm8gPT0gXCJ1bmRlZmluZWRcIikge1xuXHRcdFx0XHRcdGNibyA9IFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNiby5wdXNoKHNlbGYpO1xuXG5cdFx0XHRcdCRzY29wZS4kd2F0Y2goc2V0dGluZ3MubmFtZSArIFwiLnNlbGVjdGVkVmFsdWVcIiwgZnVuY3Rpb24obmV3VmFsLCBvbGRWYWwpIHtcblx0XHRcdFx0XHRzZWxmLmNvZGUgPSBuZXdWYWw7XG5cdFx0XHRcdFx0JHNjb3BlLiRlbWl0KHNldHRpbmdzLm5hbWUgKyAnLmNoYW5nZScsIHtcblx0XHRcdFx0XHRcdHNlbGVjdGVkVmFsdWU6IG5ld1ZhbFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0JHNjb3BlLiR3YXRjaChzZXR0aW5ncy5uYW1lICsgXCIuY29kZVwiLCBmdW5jdGlvbihuZXdWYWwsIG9sZFZhbCkge1xuXHRcdFx0XHRcdHNlbGYuc2VsZWN0ZWRWYWx1ZSA9IG5ld1ZhbDtcblxuXHRcdFx0XHRcdHNlbGYuZGVzY3JpcHRpb24gPSAoXy5maW5kKHNlbGYuaXRlbXMsIGZ1bmN0aW9uKGl0ZW0pIHtcblx0XHRcdFx0XHRcdHJldHVybiBpdGVtLl9pZCA9PSBuZXdWYWw7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdHNlbGYuZGVzY3JpcHRpb24gPSBzZWxmLmRlc2NyaXB0aW9uICYmIHNlbGYuZGVzY3JpcHRpb24uZGVzY3JpcHRpb24gfHwgXCJcIjtcblxuXHRcdFx0XHRcdCRzY29wZS4kZW1pdChzZXR0aW5ncy5uYW1lICsgJy5jaGFuZ2UnLCB7XG5cdFx0XHRcdFx0XHRzZWxlY3RlZFZhbHVlOiBuZXdWYWxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0ZnVuY3Rpb24gY29weShvYmosIGZpZWxkV29yZCwgdmFsKSB7XG5cdFx0XHRcdFx0aWYgKF8uaXNVbmRlZmluZWQodmFsKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodmFsLnRvU3RyaW5nKCkgPT09ICctMScpIHtcblx0XHRcdFx0XHRcdG9ialtmaWVsZFdvcmRdID0gJyc7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG9ialtmaWVsZFdvcmRdID0gdmFsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZ1bmN0aW9uIGNvcHlXaGVuUG9zaWJsZShmdWxscGF0aCwgdmFsKSB7XG5cdFx0XHRcdFx0aWYgKF8uaXNVbmRlZmluZWQoZnVsbHBhdGgpIHx8IF8uaXNOdWxsKGZ1bGxwYXRoKSB8fCBmdWxscGF0aC5sZW5ndGggPT0gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuOyAvL29taXQhXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHZhciBjdXRzID0gZnVsbHBhdGgudG9TdHJpbmcoKS5zcGxpdCgnLicpO1xuXHRcdFx0XHRcdHZhciBmaWVsZFdvcmQgPSBjdXRzW2N1dHMubGVuZ3RoIC0gMV07XG5cdFx0XHRcdFx0dmFyIHBvcyA9IGZ1bGxwYXRoLnRvU3RyaW5nKCkuaW5kZXhPZignLicgKyBmaWVsZFdvcmQpO1xuXHRcdFx0XHRcdHZhciBwYXRoID0gZnVsbHBhdGgudG9TdHJpbmcoKS5zdWJzdHJpbmcoMCwgcG9zKTtcblx0XHRcdFx0XHQvL2NvbnNvbGUuaW5mbyhcInNlZWtpbmcgZm9yIHBhdGggb2JqIG9uIF8+Pj4+IFwiK3BhdGgpO1xuXHRcdFx0XHRcdHZhciBvYmogPSBzZWVrT2JqZWN0KHBhdGgsICRzY29wZSk7XG5cdFx0XHRcdFx0Ly9jb25zb2xlLmluZm8oXCJmb3VuZGVkIFwiK0pTT04uc3RyaW5naWZ5KG9iaikpO1xuXHRcdFx0XHRcdGlmIChfLmlzVW5kZWZpbmVkKG9iaikgfHwgXy5pc051bGwob2JqKSkge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5pbmZvKFwiY29weVdoZW5Qb3NpYmxlIGZhaWx1cmUgZm9yIHBhdGggLT4gXCIgKyBmdWxscGF0aCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47IC8vb21pdCFcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29weShvYmosIGZpZWxkV29yZCwgdmFsKTtcblx0XHRcdFx0fVxuXG5cblx0XHRcdFx0JHNjb3BlLiR3YXRjaChzZXR0aW5ncy5uYW1lICsgJy5jb2RlJywgZnVuY3Rpb24obmV3VmFsLCBvbGRWYWwpIHtcblx0XHRcdFx0XHRjb3B5V2hlblBvc2libGUoc2VsZi5jb2RlX2NvcHl0bywgbmV3VmFsKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvcHlXaGVuUG9zaWJsZShzZWxmLmNvZGVfY29weXRvLCBzZWxmLmNvZGUgfHwgJycpO1xuXG5cblxuXHRcdFx0XHQvL3NldCBkZWZhdWx0c1xuXHRcdFx0XHQkc2NvcGUuJGVtaXQoc2V0dGluZ3MubmFtZSArICcuY2hhbmdlJywge1xuXHRcdFx0XHRcdHNlbGVjdGVkVmFsdWU6IHNlbGYuY29kZVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoc2VsZi5kZXNjcmlwdGlvbl9jb3B5dG8gIT0gbnVsbCkge1xuXHRcdFx0XHRcdHZhciBjdXRzID0gc2VsZi5kZXNjcmlwdGlvbl9jb3B5dG8udG9TdHJpbmcoKS5zcGxpdCgnLicpO1xuXHRcdFx0XHRcdHNlbGYuZGVzY3JpcHRpb25fY29weXRvX2ZpZWxkV29yZCA9IGN1dHNbY3V0cy5sZW5ndGggLSAxXTtcblx0XHRcdFx0XHR2YXIgcG9zID0gc2VsZi5kZXNjcmlwdGlvbl9jb3B5dG8udG9TdHJpbmcoKS5pbmRleE9mKCcuJyArIHNlbGYuZGVzY3JpcHRpb25fY29weXRvX2ZpZWxkV29yZCk7XG5cdFx0XHRcdFx0dmFyIHBhdGggPSBzZWxmLmRlc2NyaXB0aW9uX2NvcHl0by50b1N0cmluZygpLnN1YnN0cmluZygwLCBwb3MpO1xuXHRcdFx0XHRcdHNlbGYuZGVzY3JpcHRpb25fY29weXRvX29iaiA9IHNlZWtPYmplY3QocGF0aCwgJHNjb3BlKTtcblx0XHRcdFx0XHQkc2NvcGUuJHdhdGNoKHNldHRpbmdzLm5hbWUgKyAnLmRlc2NyaXB0aW9uJywgZnVuY3Rpb24obmV3VmFsLCBvbGRWYWwpIHtcblx0XHRcdFx0XHRcdGNvcHkoc2VsZi5kZXNjcmlwdGlvbl9jb3B5dG9fb2JqLCBzZWxmLmRlc2NyaXB0aW9uX2NvcHl0b19maWVsZFdvcmQsIG5ld1ZhbCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0Y29weShzZWxmLmRlc2NyaXB0aW9uX2NvcHl0b19vYmosIHNlbGYuZGVzY3JpcHRpb25fY29weXRvX2ZpZWxkV29yZCwgc2VsZi5kZXNjcmlwdGlvbiB8fCAnJyk7XG5cdFx0XHRcdFx0JHNjb3BlLiRlbWl0KHNldHRpbmdzLm5hbWUgKyAnLmRlc2NyaXB0aW9uJywge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHNlbGYuZGVzY3JpcHRpb25cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cblx0XHRcdFx0c2VsZi51cGRhdGUgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHQkUUpBcGkuZ2V0Q29udHJvbGxlcihzZXR0aW5ncy5hcGkuY29udHJvbGxlcikuZ2V0KHNldHRpbmdzLmFwaS5wYXJhbXMsIGZ1bmN0aW9uKHJlcykge1xuXHRcdFx0XHRcdFx0Ly8kUUpMb2dnZXIubG9nKFwiUUpDQ29tYm9ib3ggLT4gXCIrc2V0dGluZ3MubmFtZStcIiAtPiBcIiArIHNldHRpbmdzLmFwaS5jb250cm9sbGVyICsgXCIgIFwiICsgc2V0dGluZ3MuYXBpLnBhcmFtcy5hY3Rpb24gKyBcIiAoXCIrSlNPTi5zdHJpbmdpZnkoc2V0dGluZ3MuYXBpLnBhcmFtcykrXCIpIC0+IHN1Y2Nlc3NcIik7XG5cdFx0XHRcdFx0XHRzZWxmLml0ZW1zID0gcmVzLml0ZW1zO1xuXHRcdFx0XHRcdFx0c2VsZi5zZWxlY3RlZFZhbHVlID0gc2VsZi5pbml0aWFsVmFsdWU7XG5cdFx0XHRcdFx0XHQvL2NvbnNvbGUuaW5mbyhyZXMucmVxKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fTtcblx0XHRcdFx0c2VsZi51cGRhdGUoKTsgLy9pbml0aWFsXG5cblx0XHRcdFx0Ly93YXRjaCBmb3IgcGFyYW1zIGNoYW5nZSB0byB1cGRhdGVcblx0XHRcdFx0JHNjb3BlLiR3YXRjaChzZXR0aW5ncy5uYW1lICsgJy5hcGkucGFyYW1zJywgZnVuY3Rpb24obmV3VmFsLCBvbGRWYWwpIHtcblx0XHRcdFx0XHRzZWxmLnVwZGF0ZSgpO1xuXHRcdFx0XHRcdC8vJFFKTG9nZ2VyLmxvZyhcIlFKQ0NvbWJvYm94IC0+IFwiICsgc2V0dGluZ3MubmFtZSArIFwiIC0+IHBhcmFtcyBjaGFuZ2VzIC0+IHVwZGF0aW5nLi5cIik7XG5cdFx0XHRcdH0sIHRydWUpO1xuXG5cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5dKTtcbm1vZHVsZS5kaXJlY3RpdmUoJ3FqY2NvbWJvYm94JywgZnVuY3Rpb24oJHJvb3RTY29wZSkge1xuXHR2YXIgZGlyZWN0aXZlID0ge307XG5cdGRpcmVjdGl2ZS5yZXN0cmljdCA9ICdFJzsgLyogcmVzdHJpY3QgdGhpcyBkaXJlY3RpdmUgdG8gZWxlbWVudHMgKi9cblx0ZGlyZWN0aXZlLnRlbXBsYXRlVXJsID0gXCJwYWdlcy9jb250cm9scy9xamNjb21ib2JveC5odG1sXCI7XG5cdGRpcmVjdGl2ZS5zY29wZSA9IHtcblx0XHRjYm86ICc9J1xuXHR9O1xuXHRkaXJlY3RpdmUuY29tcGlsZSA9IGZ1bmN0aW9uKGVsZW1lbnQsIGF0dHJpYnV0ZXMpIHtcblx0XHR2YXIgbGlua0Z1bmN0aW9uID0gZnVuY3Rpb24oJHNjb3BlLCBlbGVtZW50LCBhdHRyaWJ1dGVzKSB7fVxuXHRcdHJldHVybiBsaW5rRnVuY3Rpb247XG5cdH1cblx0cmV0dXJuIGRpcmVjdGl2ZTtcbn0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJodFpreDRcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLlxcXFxjb250cm9sc1xcXFxxamNvbWJvYm94Q3RybC5qc1wiLFwiLy4uXFxcXGNvbnRyb2xzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIG1vZHVsZSA9IHJlcXVpcmUoJy4vX21vZHVsZV9pbml0LmpzJyk7XG5tb2R1bGUuZmFjdG9yeSgnJFFKQ0ZpbHRlcicsIFtcblx0JyRRSkxvZ2dlcicsICckcm9vdFNjb3BlJywgJyRzdGF0ZScsICckdGltZW91dCcsICckUUpMb2NhbFNlc3Npb24nLCAnJFFKQXV0aCcsXG5cdGZ1bmN0aW9uKCRRSkxvZ2dlciwgJHJvb3RTY29wZSwgJHN0YXRlLCAkdGltZW91dCwgJFFKTG9jYWxTZXNzaW9uLCAkUUpBdXRoKSB7XG5cdFx0dmFyIHNlbGYgPSB7XG5cdFx0XHRmaWVsZHM6IHt9XG5cdFx0fTtcblxuXHRcdGZ1bmN0aW9uIGdldEJpbmRlZEFycmF5KGFycmF5TmFtZSwgJHNjb3BlLCBvYmosIGluZGV4KSB7XG5cdFx0XHRpZiAoaW5kZXggPT0gMCkge1xuXHRcdFx0XHQkUUpMb2dnZXIubG9nKCdRSkNGaWx0ZXIgLT4gZ2V0QmluZGVkQXJyYXkgLT4gc29tZXRoaW5nIHdlbnQgd3JvbmcgYW5kIGkgYWJvcnQgdGhlIHJlY3Vyc2l2ZSBmdW5jIGJybyEnKTtcblx0XHRcdH1cblx0XHRcdGlmICghXy5pc1VuZGVmaW5lZChvYmopICYmIF8uaXNOdWxsKG9iaikpIHtcblx0XHRcdFx0cmV0dXJuIG9iajtcblx0XHRcdH1cblx0XHRcdGlmIChhcnJheU5hbWUudG9TdHJpbmcoKS5zcGxpdCgnLicpLmxlbmd0aCA9PSAxIHx8IGluZGV4ID09IDApIHtcblx0XHRcdFx0Ly9jb25zb2xlLmluZm8oYXJyYXlOYW1lKTtcblx0XHRcdFx0aWYgKCFfLmlzVW5kZWZpbmVkKG9iaikpIHtcblx0XHRcdFx0XHRyZXR1cm4gb2JqW2FycmF5TmFtZV0gfHwgbnVsbDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvL2NvbnNvbGUuaW5mbygncmV0dXJuIHRoaXMgLT4nK2FycmF5TmFtZSk7XG5cdFx0XHRcdFx0Ly9jb25zb2xlLmluZm8oJHNjb3BlW2FycmF5TmFtZV0pO1xuXHRcdFx0XHRcdHJldHVybiAkc2NvcGVbYXJyYXlOYW1lXSB8fCBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhciBmaXJzdFBhcnQgPSBhcnJheU5hbWUudG9TdHJpbmcoKS5zcGxpdCgnLicpWzBdO1xuXHRcdFx0XHR2YXIgcmVzdCA9IGFycmF5TmFtZS5zdWJzdHJpbmcoZmlyc3RQYXJ0Lmxlbmd0aCArIDEpO1xuXHRcdFx0XHQvL2NvbnNvbGUuaW5mbyhhcnJheU5hbWUpO1xuXHRcdFx0XHRyZXR1cm4gZ2V0QmluZGVkQXJyYXkocmVzdCwgJHNjb3BlLCAkc2NvcGVbZmlyc3RQYXJ0XSwgKF8uaXNVbmRlZmluZWQoaW5kZXgpID8gMjAgOiBpbmRleC0tKSk7XG5cdFx0XHR9XG5cblx0XHR9O1xuXHRcdHJldHVybiB7XG5cdFx0XHRjcmVhdGU6IGZ1bmN0aW9uKHNldHRpbmdzLCAkc2NvcGUpIHtcblx0XHRcdFx0Xy5lYWNoKHNldHRpbmdzLmZpZWxkcywgZnVuY3Rpb24oZmllbGQsIGtleSkge1xuXHRcdFx0XHRcdHNlbGYuZmllbGRzW2ZpZWxkLm5hbWVdID0gbnVsbDtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly9kZWZhdWx0c1xuXHRcdFx0XHRzZXR0aW5ncy5maWx0ZXJlZGZpZWxkTmFtZSA9IHNldHRpbmdzLmZpbHRlcmVkZmllbGROYW1lIHx8ICdfcWpmaWx0ZXJlZCc7XG5cblx0XHRcdFx0Ly9zdG9yZXMgc2V0dGluZ3MgYXMgcHJvcGVydHlcblx0XHRcdFx0c2VsZi5zZXR0aW5ncyA9IHNldHRpbmdzO1xuXHRcdFx0XHQkc2NvcGVbc2V0dGluZ3MubmFtZV0gPSBzZWxmO1xuXG5cdFx0XHRcdHNlbGYuZmlsdGVyID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0Ly9jb25zb2xlLmNsZWFyKCk7XG5cdFx0XHRcdFx0Y29udGFpblZhbGlkYXRpb25TdWNjZXNzSXRlbXNLZXlzID0gW107XG5cdFx0XHRcdFx0Xy5lYWNoKHNlbGYuZmllbGRzLCBmdW5jdGlvbih2YWwsIGtleSkge1xuXHRcdFx0XHRcdFx0dmFyIGtleVdob0NoYW5nZXMgPSBrZXk7IC8vdXBkYXRlcyBiYXNlZCBvbiBhbGwgZmlsdGVycyAhIGZpeFxuXHRcdFx0XHRcdFx0dmFyIG5ld0ZpZWxkVmFsdWUgPSB2YWw7XG5cdFx0XHRcdFx0XHRfLmVhY2goc2V0dGluZ3MuZmllbGRzLCBmdW5jdGlvbihmaWVsZCwga2V5KSB7XG5cdFx0XHRcdFx0XHRcdGlmIChrZXlXaG9DaGFuZ2VzICE9PSBmaWVsZC5uYW1lKSByZXR1cm47IC8vdGFrZSBvbmx5IHRoZSBvbmUgd2hvIGNoYW5nZXNcblx0XHRcdFx0XHRcdFx0dmFyIGJpbmRlZEFycmF5ID0gZ2V0QmluZGVkQXJyYXkoZmllbGQuYXJyYXlOYW1lLCAkc2NvcGUpO1xuXHRcdFx0XHRcdFx0XHRpZiAoYmluZGVkQXJyYXkgIT09IG51bGwpIHtcblx0XHRcdFx0XHRcdFx0XHRfLmVhY2goYmluZGVkQXJyYXksIGZ1bmN0aW9uKGJpbmRlZEFycmF5SXRlbSwgYmluZGVkQXJyYXlJdGVtS2V5KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRiaW5kZWRBcnJheUl0ZW1IYXNTdWNjZXNzQW55ID0gKG51bGwgIT0gXy5maW5kKGNvbnRhaW5WYWxpZGF0aW9uU3VjY2Vzc0l0ZW1zS2V5cywgZnVuY3Rpb24odmFsKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB2YWwgPT0gYmluZGVkQXJyYXlJdGVtS2V5XG5cdFx0XHRcdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoYmluZGVkQXJyYXlJdGVtSGFzU3VjY2Vzc0FueSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm47IC8vIGp1bXAgYmVjYXVzZSBhbHJlZHkgc3VjY2VzIHZhbGlkYXRpb24gYW5kIGl0IG5vdCBnb25uYSBiZSBmaWx0ZXJlZFxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0dmFyIGNvbnRhaW5WYWxpZGF0aW9uUmVzcG9uc2UgPSBbXTtcblx0XHRcdFx0XHRcdFx0XHRcdF8uZWFjaChmaWVsZC5iaW5kVG8sIGZ1bmN0aW9uKGJpbmRUb0ZpZWxkLCBrZXkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dmFyIF9maWVsZCA9IGJpbmRlZEFycmF5SXRlbVtiaW5kVG9GaWVsZF07XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmICghXy5pc1VuZGVmaW5lZChfZmllbGQpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKF9maWVsZCAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0dmFyIGZsYWcgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKF8uaXNVbmRlZmluZWQobmV3RmllbGRWYWx1ZSkgfHwgXy5pc051bGwobmV3RmllbGRWYWx1ZSkgfHwgbmV3RmllbGRWYWx1ZSA9PSBcIlwiKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybjsgLy8ganVtcCBiZWNhdXNlIGZpbHRlciBmaWVsZCBpcyBlbXB0eSFcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHZhciBpbmRleG9mID0gX2ZpZWxkLnRvU3RyaW5nKCkudG9Mb3dlckNhc2UoKS5pbmRleE9mKG5ld0ZpZWxkVmFsdWUudG9TdHJpbmcoKS50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKGluZGV4b2YgIT09IC0xKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZmxhZyA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZmxhZyA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb250YWluVmFsaWRhdGlvblJlc3BvbnNlLnB1c2goZmxhZyk7XG5cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0JFFKTG9nZ2VyLmxvZyhcIlFKQ0ZpbHRlciAtPiBXYXJuaW5nIC0+IGJpbmRlZEFycmF5SXRlbSBcIiArIGJpbmRUb0ZpZWxkICsgXCIgYXQgaW5kZXggXCIgKyBiaW5kZWRBcnJheUl0ZW1LZXkgKyBcIiBpcyBudWxsIHNvIGl0cyBvbWl0ZWQgZnJvbSBmaWx0ZXJpbmdcIik7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCRRSkxvZ2dlci5sb2coXCJRSkNGaWx0ZXIgLT4gV2FybmluZyAtPiBiaW5kZWRBcnJheUl0ZW0gXCIgKyBiaW5kVG9GaWVsZCArIFwiIGRvIG5vdCBleGlzdHMgaW4gXCIgKyBmaWVsZC5hcnJheU5hbWUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0XHRcdHZhciBwYXNzQ29udGFpblZhbGlkYXRpb24gPSAobnVsbCAhPSBfLmZpbmQoY29udGFpblZhbGlkYXRpb25SZXNwb25zZSwgZnVuY3Rpb24odmFsKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB2YWwgPT0gdHJ1ZVxuXHRcdFx0XHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0XHRcdFx0YmluZGVkQXJyYXlJdGVtW3NldHRpbmdzLmZpbHRlcmVkZmllbGROYW1lXSA9ICFwYXNzQ29udGFpblZhbGlkYXRpb247XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoY29udGFpblZhbGlkYXRpb25SZXNwb25zZS5sZW5ndGggPT0gMCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRiaW5kZWRBcnJheUl0ZW1bc2V0dGluZ3MuZmlsdGVyZWRmaWVsZE5hbWVdID0gZmFsc2U7IC8vbm8gaHVibyByZXNwdWVzdGFzIHBvciBsbyB0YW50byBubyBzZSBmaWx0cmFcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdGlmIChiaW5kZWRBcnJheUl0ZW1bc2V0dGluZ3MuZmlsdGVyZWRmaWVsZE5hbWVdKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRhaW5WYWxpZGF0aW9uU3VjY2Vzc0l0ZW1zS2V5cy5wdXNoKGJpbmRlZEFycmF5SXRlbUtleSk7IC8vc2kgc2UgZmlsdHJhIHVuYSB2ZXMganVtcCBwYXJhIGVsIHJlc3RvXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0JFFKTG9nZ2VyLmxvZyhcIlFKQ0ZpbHRlciAtPiBXYXJuaW5nIC0+IGFycmF5TmFtZSBcIiArIGZpZWxkLmFycmF5TmFtZSArIFwiIGZvciBmaWx0ZXIgZmllbGQgXCIgKyBmaWVsZC5uYW1lICsgXCIgZG8gbm90IGV4aXN0cyBvbiB0aGUgc2NvcGVcIik7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdCRzY29wZS4kZW1pdCgncWpjZmlsdGVyLnVwZGF0ZScsIHtcblx0XHRcdFx0XHRcdGZpbHRlcmVkZmllbGROYW1lOiBzZXR0aW5ncy5maWx0ZXJlZGZpZWxkTmFtZVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHQkc2NvcGUuJHdhdGNoKHNldHRpbmdzLm5hbWUgKyAnLmZpZWxkcycsIGZ1bmN0aW9uKG5ld1ZhbHVlLCBvbGRWYWx1ZSkge1xuXHRcdFx0XHRcdHNlbGYuZmlsdGVyKCk7XG5cdFx0XHRcdH0sIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uXFxcXGNvbnRyb2xzXFxcXHFqZmlsdGVyQ3RybC5qc1wiLFwiLy4uXFxcXGNvbnRyb2xzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIG1vZHVsZSA9IHJlcXVpcmUoJy4vX21vZHVsZV9pbml0LmpzJyk7XG5tb2R1bGUuZmFjdG9yeSgnJFFKQ0xpc3R2aWV3JywgW1xuXHQnJFFKQXBpJywgJyRRSkhlbHBlckZ1bmN0aW9ucycsICckUUpMb2dnZXInLCAnJHJvb3RTY29wZScsICckc3RhdGUnLCAnJHRpbWVvdXQnLCAnJFFKTG9jYWxTZXNzaW9uJywgJyRRSkF1dGgnLFxuXHRmdW5jdGlvbigkUUpBcGksICRRSkhlbHBlckZ1bmN0aW9ucywgJFFKTG9nZ2VyLCAkcm9vdFNjb3BlLCAkc3RhdGUsICR0aW1lb3V0LCAkUUpMb2NhbFNlc3Npb24sICRRSkF1dGgpIHtcblxuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlUGFnZWRMaXN0KGl0ZW1zLCBlbnRyaWVzUGVyUGFnZSkge1xuXHRcdFx0dmFyIHBhZ2VzQ291bnRlciA9IDE7XG5cdFx0XHR2YXIgcGFnZXMgPSBbXTtcblx0XHRcdC8vXG5cdFx0XHR2YXIgX2N1cnJJdGVtSW5kZXggPSAwO1xuXHRcdFx0dmFyIF9jdXJyUGFnZSA9IFtdO1xuXHRcdFx0d2hpbGUgKF9jdXJySXRlbUluZGV4IDwgaXRlbXMubGVuZ3RoKSB7IC8vZWo6IDAgPCA1XG5cdFx0XHRcdGlmIChfY3VyclBhZ2UubGVuZ3RoIDwgZW50cmllc1BlclBhZ2UpIHtcblx0XHRcdFx0XHRfY3VyclBhZ2UucHVzaChpdGVtc1tfY3Vyckl0ZW1JbmRleF0pO1xuXHRcdFx0XHRcdF9jdXJySXRlbUluZGV4Kys7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cGFnZXMucHVzaChfY3VyclBhZ2UpO1xuXHRcdFx0XHRcdF9jdXJyUGFnZSA9IFtdO1xuXHRcdFx0XHRcdHBhZ2VzQ291bnRlcisrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoX2N1cnJQYWdlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cGFnZXMucHVzaChfY3VyclBhZ2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHBhZ2VzO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGJ1aWxkTGlzdFZpZXdEYXRhKGl0ZW1zKSB7XG5cdFx0XHR2YXIgZW50cmllc1BlclBhZ2UgPSAkcm9vdFNjb3BlLmNvbmZpZy5saXN0dmlld0VudHJpZXNQZXJQYWdlOyAvL2VqOiAyICAgXG5cdFx0XHR2YXIgcGFnZXMgPSBbXTtcblx0XHRcdGlmICghXy5pc1VuZGVmaW5lZChpdGVtcykpIHtcblx0XHRcdFx0cGFnZXMgPSBjcmVhdGVQYWdlZExpc3QoaXRlbXMsIGVudHJpZXNQZXJQYWdlKTtcblx0XHRcdH1cblx0XHRcdHZhciBwYWdlTnVtYmVycyA9IFtdO1xuXHRcdFx0Xy5lYWNoKHBhZ2VzLCBmdW5jdGlvbihlLCBpbmRleCkge1xuXHRcdFx0XHRwYWdlTnVtYmVycy5wdXNoKGluZGV4ICsgMSk7XG5cdFx0XHR9KTtcblx0XHRcdHZhciBfbHZEYXRhID0ge1xuXHRcdFx0XHRjdXJyZW50UGFnZUluZGV4OiAwLFxuXHRcdFx0XHRjdXJyZW50UGFnZTogcGFnZXNbMF0sXG5cdFx0XHRcdHRvdGFsUGFnZXM6IHBhZ2VzLmxlbmd0aCxcblx0XHRcdFx0dG90YWxJdGVtczogaXRlbXMubGVuZ3RoLFxuXHRcdFx0XHRwYWdlczogcGFnZXMsXG5cdFx0XHRcdHBhZ2luYXRpb246IHtcblx0XHRcdFx0XHRwYWdlTnVtYmVyczogcGFnZU51bWJlcnMsXG5cdFx0XHRcdFx0ZGlzYWJsZWRGb3JQcmV2TGluazogZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gX2x2RGF0YS5jdXJyZW50UGFnZUluZGV4ID09PSAwID8gdHJ1ZSA6IGZhbHNlO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZGlzYWJsZWRGb3JOZXh0TGluazogZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gX2x2RGF0YS5jdXJyZW50UGFnZUluZGV4ID49IHBhZ2VzLmxlbmd0aCAtIDEgPyB0cnVlIDogZmFsc2U7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhY3RpdmVGb3JMaW5rOiBmdW5jdGlvbihwYWdlTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRpZiAoKHBhZ2VOdW1iZXIgPT09IF9sdkRhdGEuY3VycmVudFBhZ2VJbmRleCArIDEpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z290bzogZnVuY3Rpb24ocGFnZU51bWJlcikge1xuXHRcdFx0XHRcdFx0X2x2RGF0YS5jdXJyZW50UGFnZUluZGV4ID0gcGFnZU51bWJlciAtIDE7XG5cdFx0XHRcdFx0XHRfbHZEYXRhLmN1cnJlbnRQYWdlID0gcGFnZXNbX2x2RGF0YS5jdXJyZW50UGFnZUluZGV4XTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG5leHQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0X2x2RGF0YS5jdXJyZW50UGFnZUluZGV4Kys7XG5cdFx0XHRcdFx0XHRpZiAoX2x2RGF0YS5jdXJyZW50UGFnZUluZGV4ID49IHBhZ2VzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRfbHZEYXRhLmN1cnJlbnRQYWdlSW5kZXggPSBwYWdlcy5sZW5ndGggLSAxO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0X2x2RGF0YS5jdXJyZW50UGFnZSA9IHBhZ2VzW19sdkRhdGEuY3VycmVudFBhZ2VJbmRleF07XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRwcmV2OiBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdF9sdkRhdGEuY3VycmVudFBhZ2VJbmRleC0tO1xuXHRcdFx0XHRcdFx0aWYgKF9sdkRhdGEuY3VycmVudFBhZ2VJbmRleCA8PSAwKSB7XG5cdFx0XHRcdFx0XHRcdF9sdkRhdGEuY3VycmVudFBhZ2VJbmRleCA9IDA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRfbHZEYXRhLmN1cnJlbnRQYWdlID0gcGFnZXNbX2x2RGF0YS5jdXJyZW50UGFnZUluZGV4XTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gX2x2RGF0YTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNyZWF0ZTogZnVuY3Rpb24oc2V0dGluZ3MsICRzY29wZSkge1xuXHRcdFx0XHQvL2luc3RhbmNlIHByaXZhdGVcblx0XHRcdFx0ZnVuY3Rpb24gcmVuZGVyKGl0ZW1zKSB7XG5cdFx0XHRcdFx0JHNjb3BlW3NldHRpbmdzLnBhZ2VkRGF0YUFycmF5XSA9IGJ1aWxkTGlzdFZpZXdEYXRhKGl0ZW1zKTtcblx0XHRcdFx0fVxuXG5cblxuXHRcdFx0XHQvL3dhdGNoXG5cdFx0XHRcdCRzY29wZS4kd2F0Y2goc2V0dGluZ3MuZGF0YUFycmF5LCBmdW5jdGlvbihuZXdWYWx1ZSwgb2xkVmFsdWUpIHtcblxuXHRcdFx0XHRcdGlmIChfLmlzVW5kZWZpbmVkKCRzY29wZVtzZXR0aW5ncy5kYXRhQXJyYXldKSkge1xuXHRcdFx0XHRcdFx0JFFKTG9nZ2VyLmxvZyhcIldBUk5JTkc6IFFKQ0xpc3R2aWV3IC0+IFwiICsgc2V0dGluZ3MuZGF0YUFycmF5ICsgXCIgLT4gXCIgKyBcIiBkYXRhQXJyYXkgdW5kZWZpbmVkXCIpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCRzY29wZVtzZXR0aW5ncy5wYWdlZERhdGFBcnJheV0gPSBidWlsZExpc3RWaWV3RGF0YSgkc2NvcGVbc2V0dGluZ3MuZGF0YUFycmF5XSk7XG5cdFx0XHRcdFx0cmVuZGVyKCRzY29wZVtzZXR0aW5ncy5kYXRhQXJyYXldKTtcblx0XHRcdFx0fSk7XG5cblxuXHRcdFx0XHQkc2NvcGUuJG9uKCdxamNmaWx0ZXIudXBkYXRlJywgZnVuY3Rpb24oYXJnczEsIGFyZ3MyKSB7XG5cdFx0XHRcdFx0JHNjb3BlLiRlbWl0KHNldHRpbmdzLm5hbWUgKyBcIi51cGRhdGVcIiwge30pO1xuXHRcdFx0XHRcdHZhciBmaWx0ZXJlZERhdGEgPSBfLmZpbHRlcigkc2NvcGVbc2V0dGluZ3MuZGF0YUFycmF5XSwgZnVuY3Rpb24oaXRlbSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuICFpdGVtW2FyZ3MyLmZpbHRlcmVkZmllbGROYW1lXTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRyZW5kZXIoZmlsdGVyZWREYXRhKTtcblxuXHRcdFx0XHRcdHZhciBmaWx0ZXJlZENvdW50ID0gXy5maWx0ZXIoJHNjb3BlW3NldHRpbmdzLmRhdGFBcnJheV0sIGZ1bmN0aW9uKGl0ZW0pIHtcblx0XHRcdFx0XHRcdHJldHVybiBpdGVtW2FyZ3MyLmZpbHRlcmVkZmllbGROYW1lXSA9PSB0cnVlO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdCRzY29wZS4kZW1pdCgncWpjbGlzdHZpZXcuZmlsdGVyLnN1Y2Nlc3MnLCB7XG5cdFx0XHRcdFx0XHRmaWx0ZXJlZENvdW50OiBmaWx0ZXJlZENvdW50XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dmFyIHNlbGYgPSBzZXR0aW5ncztcblx0XHRcdFx0JHNjb3BlW3NldHRpbmdzLm5hbWVdID0gc2VsZjtcblxuXHRcdFx0XHRzZWxmLnVwZGF0ZSA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdC8vREJcblx0XHRcdFx0XHQkUUpBcGkuZ2V0Q29udHJvbGxlcihzZXR0aW5ncy5hcGkuY29udHJvbGxlcikuZ2V0KHNldHRpbmdzLmFwaS5wYXJhbXMsIGZ1bmN0aW9uKHJlcykge1xuXHRcdFx0XHRcdFx0JFFKTG9nZ2VyLmxvZyhcIlFKQ0xpc3R2aWV3IC0+IFwiICsgc2V0dGluZ3MuYXBpLmNvbnRyb2xsZXIgKyBcIiBcIiArIHNldHRpbmdzLmFwaS5wYXJhbXMuYWN0aW9uICsgXCIgLT4gc3VjY2Vzc1wiKTtcblx0XHRcdFx0XHRcdCRzY29wZVtzZXR0aW5ncy5kYXRhQXJyYXldID0gcmVzLml0ZW1zO1xuXHRcdFx0XHRcdFx0JHNjb3BlLiRlbWl0KHNldHRpbmdzLm5hbWUgKyBcIi51cGRhdGVcIiwge30pO1xuXHRcdFx0XHRcdFx0Ly9jb25zb2xlLmluZm8oJHNjb3BlW3NldHRpbmdzLmRhdGFBcnJheV0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdC8vJHNjb3BlLiRlbWl0KHNldHRpbmdzLm5hbWUrXCIudXBkYXRlXCIse30pO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRzZWxmLnVwZGF0ZSgpO1xuXG5cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5dKTtcblxuXG5tb2R1bGUuZGlyZWN0aXZlKCdxamNsaXN0dmlldycsIGZ1bmN0aW9uKCkge1xuXHR2YXIgZGlyZWN0aXZlID0ge307XG5cdGRpcmVjdGl2ZS5yZXN0cmljdCA9ICdFJzsgLyogcmVzdHJpY3QgdGhpcyBkaXJlY3RpdmUgdG8gZWxlbWVudHMgKi9cblx0ZGlyZWN0aXZlLnRlbXBsYXRlVXJsID0gXCJwYWdlcy9jb250cm9scy9xamNsaXN0dmlldy5odG1sXCI7XG5cdGRpcmVjdGl2ZS5zY29wZSA9IHtcblx0XHRkYXRhOiBcIj1cIixcblx0XHRsdnc6IFwiPVwiXG5cdH1cblx0ZGlyZWN0aXZlLmNvbXBpbGUgPSBmdW5jdGlvbihlbGVtZW50LCBhdHRyaWJ1dGVzKSB7XG5cdFx0dmFyIGxpbmtGdW5jdGlvbiA9IGZ1bmN0aW9uKCRzY29wZSwgZWxlbWVudCwgYXR0cmlidXRlcykge31cblx0XHRyZXR1cm4gbGlua0Z1bmN0aW9uO1xuXHR9XG5cdHJldHVybiBkaXJlY3RpdmU7XG59KTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiaHRaa3g0XCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi5cXFxcY29udHJvbHNcXFxccWpsaXN0dmlld0N0cmwuanNcIixcIi8uLlxcXFxjb250cm9sc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBtb2R1bGUgPSByZXF1aXJlKCcuL19tb2R1bGVfaW5pdC5qcycpO1xubW9kdWxlLmZhY3RvcnkoJyRRSkNTZWxlY3RrZXknLCBbXG5cdCckUUpMb2dnZXInLCAnJHJvb3RTY29wZScsICckc3RhdGUnLCAnJHRpbWVvdXQnLCAnJFFKTG9jYWxTZXNzaW9uJywgJyRRSkF1dGgnLFxuXHRmdW5jdGlvbigkUUpMb2dnZXIsICRyb290U2NvcGUsICRzdGF0ZSwgJHRpbWVvdXQsICRRSkxvY2FsU2Vzc2lvbiwgJFFKQXV0aCkge1xuXHRcdHJldHVybiB7fTtcblx0fVxuXSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uXFxcXGNvbnRyb2xzXFxcXHFqc2VsZWN0a2V5Q3RybC5qc1wiLFwiLy4uXFxcXGNvbnRyb2xzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIG1vZHVsZSA9IHJlcXVpcmUoJy4vX21vZHVsZV9pbml0LmpzJyk7XG5tb2R1bGUuZmFjdG9yeSgnJFFKQ1RpbWVDb3VudGVyJywgW1xuXHQnJGludGVydmFsJywgJyRRSkFwaScsICckUUpIZWxwZXJGdW5jdGlvbnMnLCAnJFFKTG9nZ2VyJywgJyRyb290U2NvcGUnLCAnJHN0YXRlJywgJyR0aW1lb3V0JywgJyRRSkxvY2FsU2Vzc2lvbicsICckUUpBdXRoJyxcblx0ZnVuY3Rpb24oJGludGVydmFsLCAkUUpBcGksICRRSkhlbHBlckZ1bmN0aW9ucywgJFFKTG9nZ2VyLCAkcm9vdFNjb3BlLCAkc3RhdGUsICR0aW1lb3V0LCAkUUpMb2NhbFNlc3Npb24sICRRSkF1dGgpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3JlYXRlOiBmdW5jdGlvbihzZXR0aW5ncywgJHNjb3BlKSB7XG5cdFx0XHRcdHZhciBzZWxmID0gXy5leHRlbmQoc2V0dGluZ3MsIHtcblx0XHRcdFx0XHR3b3JraW5nOiBmYWxzZSxcblx0XHRcdFx0XHRwcm9qZWN0OiBcIm5vbmVcIixcblx0XHRcdFx0XHRzdGFydFRpbWVGb3JtYXRlZDogbnVsbCxcblx0XHRcdFx0XHRlbmRUaW1lRm9ybWF0ZWQ6IG51bGwsXG5cdFx0XHRcdFx0ZXJyb3JzOiBbXSxcblx0XHRcdFx0XHRjYWxsaW5nQXBpOiBmYWxzZVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2VsZi5hZGRFcnJvciA9IGZ1bmN0aW9uKGVycm9yKSB7XG5cdFx0XHRcdFx0c2VsZi5lcnJvcnMucHVzaChlcnJvcik7XG5cdFx0XHRcdFx0JHRpbWVvdXQoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHQkc2NvcGUuJGFwcGx5KGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0XHRzZWxmLmVycm9ycyA9IFtdO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSwgMjAwMCk7XG5cdFx0XHRcdH07XG5cdFx0XHRcdHNlbGYucmVzdGFydCA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdHNlbGYuc3RhcnRUaW1lRm9ybWF0ZWQgPSBudWxsO1xuXHRcdFx0XHRcdHNlbGYuZW5kVGltZUZvcm1hdGVkID0gbnVsbDtcblx0XHRcdFx0XHRzZWxmLmVycm9ycyA9IFtdO1xuXHRcdFx0XHRcdHNlbGYuZGlmZkZvcm1hdGVkID0gbnVsbDtcblx0XHRcdFx0fTtcblx0XHRcdFx0c2VsZi5pbml0ID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0aWYgKHNlbGYuY2FsbGluZ0FwaSkgcmV0dXJuOyAvL2NhbGxpbmcgYXB5IHN5bmMgcGxlYXNlLlxuXHRcdFx0XHRcdHNlbGYucmVzdGFydCgpO1xuXHRcdFx0XHRcdHNlbGYuY2FsbGluZ0FwaSA9IHRydWU7XG5cdFx0XHRcdFx0JFFKQXBpLmdldENvbnRyb2xsZXIoc2V0dGluZ3MuYXBpLmNvbnRyb2xsZXIpLmdldChzZXR0aW5ncy5hcGkucGFyYW1zLCBmdW5jdGlvbihyZXMpIHtcblx0XHRcdFx0XHRcdHNlbGYuY2FsbGluZ0FwaSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0JFFKTG9nZ2VyLmxvZyhcIlFKQ1RpbWVDb3VudGVyIC0+IFwiICsgSlNPTi5zdHJpbmdpZnkoc2V0dGluZ3MuYXBpKSArIFwiIC0+IHN1Y2Nlc3NcIik7XG5cdFx0XHRcdFx0XHRzZWxmLndvcmtpbmcgPSAocmVzLml0ZW0gIT0gbnVsbCk7XG5cdFx0XHRcdFx0XHRzZWxmLnJlc2l0ZW0gPSByZXMuaXRlbTtcblx0XHRcdFx0XHRcdGlmICghXy5pc1VuZGVmaW5lZChzZXR0aW5ncy5vbkluaXQpKSB7XG5cdFx0XHRcdFx0XHRcdHNldHRpbmdzLm9uSW5pdChzZWxmKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRyZXR1cm4gc2VsZjtcblx0XHRcdFx0fTtcblx0XHRcdFx0c2VsZi5nZXRUaW1lID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRzZWxmLmdldFRpbWVGb3JtYXRlZCA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdHJldHVybiBtb21lbnQoc2VsZi5nZXRUaW1lKCkpLmZvcm1hdChcImRkZGQsIE1NTU0gRG8gWVlZWSwgaDptbTpzcyBhXCIpO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRzZWxmLmdldERpZmYgPSBmdW5jdGlvbihtaWxsaSkge1xuXHRcdFx0XHRcdHZhciBhY3R1YWwgPSBzZWxmLmdldFRpbWUoKTtcblx0XHRcdFx0XHRyZXR1cm4gKGFjdHVhbCAtIG1pbGxpKTtcblx0XHRcdFx0fTtcblx0XHRcdFx0c2VsZi5nZXREaWZmRm9ybWF0ZWQgPSBmdW5jdGlvbihtaWxsaSkge1xuXHRcdFx0XHRcdHZhciBkaWZmID0gc2VsZi5nZXREaWZmKG1pbGxpKTtcblx0XHRcdFx0XHR2YXIgZHVyYXRpb24gPSB7XG5cdFx0XHRcdFx0XHRob3VyczogTWF0aC5yb3VuZCgoZGlmZiAvIDEwMDAgLyA2MCAvIDYwKSAlIDI0KSxcblx0XHRcdFx0XHRcdG1pbnV0ZXM6IE1hdGgucm91bmQoKGRpZmYgLyAxMDAwIC8gNjApICUgNjApLFxuXHRcdFx0XHRcdFx0c2Vjb25kczogTWF0aC5yb3VuZCgoZGlmZiAvIDEwMDApICUgNjApXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR2YXIgc3RyID0gXCJcIjtcblx0XHRcdFx0XHRzdHIgKz0gZHVyYXRpb24uaG91cnMgKyBcIiBob3VycywgXCI7XG5cdFx0XHRcdFx0c3RyICs9IGR1cmF0aW9uLm1pbnV0ZXMgKyBcIiBtaW5zLCBcIjtcblx0XHRcdFx0XHRzdHIgKz0gZHVyYXRpb24uc2Vjb25kcyArIFwiIHNlY3MsIFwiO1xuXHRcdFx0XHRcdC8vc3RyICs9IGRpZmYgKyBcIiB0b3RhbCwgXCI7XG5cdFx0XHRcdFx0cmV0dXJuIHN0cjtcblx0XHRcdFx0fTtcblx0XHRcdFx0c2VsZi52YWxpZGF0ZVN0YXJ0ID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0aWYgKCFfLmlzVW5kZWZpbmVkKHNldHRpbmdzLm9uVmFsaWRhdGVTdGFydCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBzZXR0aW5ncy5vblZhbGlkYXRlU3RhcnQoc2VsZik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0c2VsZi5yZXN1bWUgPSBmdW5jdGlvbihmcm9tKSB7XG5cdFx0XHRcdFx0c2VsZi5zdGFydChmcm9tKTtcblx0XHRcdFx0fTtcblx0XHRcdFx0c2VsZi5zdGFydCA9IGZ1bmN0aW9uKHN0YXJ0KSB7XG5cdFx0XHRcdFx0aWYgKCFzZWxmLnZhbGlkYXRlU3RhcnQoKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvL2NvbnNvbGUuaW5mbyhcIlRJTUVSIFNUQVJURUQgRkFJTFwiKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvL1xuXHRcdFx0XHRcdC8vY29uc29sZS5pbmZvKFwiVElNRVIgU1RBUlRFRFwiKTtcblxuXHRcdFx0XHRcdGlmIChzdGFydCAmJiBzdGFydC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRzZWxmLl9zdGFydFZhbCA9IHBhcnNlSW50KHN0YXJ0KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0c2VsZi5fc3RhcnRWYWwgPSBzZWxmLmdldFRpbWUoKTsgLy9zdGFydCBzZXR0ZWRcdFxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghXy5pc1VuZGVmaW5lZChzZXR0aW5ncy5vblN0YXJ0Q2hhbmdlKSkge1xuXHRcdFx0XHRcdFx0c2V0dGluZ3Mub25TdGFydENoYW5nZShzZWxmLl9zdGFydFZhbCwgc2VsZik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHNlbGYuc3RhcnRUaW1lRm9ybWF0ZWQgPSBzZWxmLmdldFRpbWVGb3JtYXRlZCgpOyAvL3N0YXJ0IGZvcm1hdGVkIHNldHRlZFxuXHRcdFx0XHRcdHNlbGYuZW5kVGltZUZvcm1hdGVkID0gc2VsZi5zdGFydFRpbWVGb3JtYXRlZDsgLy9lbmQgc2V0dGVkXG5cdFx0XHRcdFx0c2VsZi5kaWZmID0gc2VsZi5nZXREaWZmKHNlbGYuX3N0YXJ0VmFsKTtcblx0XHRcdFx0XHRzZWxmLmRpZmZGb3JtYXRlZCA9IHNlbGYuZ2V0RGlmZkZvcm1hdGVkKHNlbGYuX3N0YXJ0VmFsKTtcblx0XHRcdFx0XHRpZiAoIV8uaXNVbmRlZmluZWQoc2V0dGluZ3Mub25EaWZmQ2hhbmdlKSkge1xuXHRcdFx0XHRcdFx0c2V0dGluZ3Mub25EaWZmQ2hhbmdlKHNlbGYuZGlmZiwgc2VsZi5kaWZmRm9ybWF0ZWQsIHNlbGYpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzZWxmLndvcmtpbmdJbnRlcnZhbCA9ICRpbnRlcnZhbChmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdGlmICghc2VsZi53b3JraW5nKSByZXR1cm47XG5cdFx0XHRcdFx0XHRzZWxmLl9zdG9wVmFsID0gc2VsZi5nZXRUaW1lKCk7XG5cdFx0XHRcdFx0XHRpZiAoIV8uaXNVbmRlZmluZWQoc2V0dGluZ3Mub25TdG9wQ2hhbmdlKSkge1xuXHRcdFx0XHRcdFx0XHRzZXR0aW5ncy5vblN0b3BDaGFuZ2Uoc2VsZi5fc3RvcFZhbCwgc2VsZik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRzZWxmLmVuZFRpbWVGb3JtYXRlZCA9IHNlbGYuZ2V0VGltZUZvcm1hdGVkKCk7XG5cdFx0XHRcdFx0XHRzZWxmLmRpZmYgPSBzZWxmLmdldERpZmYoc2VsZi5fc3RhcnRWYWwpO1xuXHRcdFx0XHRcdFx0c2VsZi5kaWZmRm9ybWF0ZWQgPSBzZWxmLmdldERpZmZGb3JtYXRlZChzZWxmLl9zdGFydFZhbCk7XG5cdFx0XHRcdFx0XHRpZiAoIV8uaXNVbmRlZmluZWQoc2V0dGluZ3Mub25EaWZmQ2hhbmdlKSkge1xuXHRcdFx0XHRcdFx0XHRzZXR0aW5ncy5vbkRpZmZDaGFuZ2Uoc2VsZi5kaWZmLCBzZWxmLmRpZmZGb3JtYXRlZCwgc2VsZik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgMTAwMCk7XG5cdFx0XHRcdFx0c2VsZi53b3JraW5nID0gdHJ1ZTtcblx0XHRcdFx0XHRpZiAoIV8uaXNVbmRlZmluZWQoc2V0dGluZ3Mub25TdGFydENsaWNrKSkge1xuXHRcdFx0XHRcdFx0c2V0dGluZ3Mub25TdGFydENsaWNrKHNlbGYpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0c2VsZi5zdG9wID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0c2VsZi53b3JraW5nID0gZmFsc2U7XG5cdFx0XHRcdFx0JGludGVydmFsLmNhbmNlbChzZWxmLndvcmtpbmdJbnRlcnZhbCk7XG5cdFx0XHRcdFx0aWYgKCFfLmlzVW5kZWZpbmVkKHNldHRpbmdzLm9uU3RvcENsaWNrKSkge1xuXHRcdFx0XHRcdFx0c2V0dGluZ3Mub25TdG9wQ2xpY2soc2VsZik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHQkc2NvcGVbc2V0dGluZ3MubmFtZV0gPSBzZWxmO1xuXHRcdFx0XHRyZXR1cm4gc2VsZjtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5dKTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiaHRaa3g0XCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi5cXFxcY29udHJvbHNcXFxccWp0aW1lcmNvdW50ZXJDdHJsLmpzXCIsXCIvLi5cXFxcY29udHJvbHNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5tb2R1bGUuZXhwb3J0cyA9IGFuZ3VsYXIubW9kdWxlKCdhcHAuZGlyZWN0aXZlcycsIFtdKTtcbnJlcXVpcmUoJy4vbmdlbnRlckRpcmVjdGl2ZS5qcycpO1xucmVxdWlyZSgnLi9xamFwaWluZm9EaXJlY3RpdmUuanMnKTtcbnJlcXVpcmUoJy4vcWpicmVhZGNydW1iRGlyZWN0aXZlLmpzJyk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uXFxcXGRpcmVjdGl2ZXNcXFxcX21vZHVsZV9pbml0LmpzXCIsXCIvLi5cXFxcZGlyZWN0aXZlc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBtb2R1bGUgPSByZXF1aXJlKCcuL19tb2R1bGVfaW5pdC5qcycpO1xubW9kdWxlLmRpcmVjdGl2ZSgnbmdFbnRlcicsIGZ1bmN0aW9uKCkge1xuXHRyZXR1cm4gZnVuY3Rpb24oc2NvcGUsIGVsZW1lbnQsIGF0dHJzKSB7XG5cdFx0ZWxlbWVudC5iaW5kKFwia2V5ZG93biBrZXlwcmVzc1wiLCBmdW5jdGlvbihldmVudCkge1xuXHRcdFx0aWYgKGV2ZW50LndoaWNoID09PSAxMykge1xuXHRcdFx0XHRzY29wZS4kYXBwbHkoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0c2NvcGUuJGV2YWwoYXR0cnMubmdFbnRlcik7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH07XG59KTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiaHRaa3g0XCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi5cXFxcZGlyZWN0aXZlc1xcXFxuZ2VudGVyRGlyZWN0aXZlLmpzXCIsXCIvLi5cXFxcZGlyZWN0aXZlc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBtb2R1bGUgPSByZXF1aXJlKCcuL19tb2R1bGVfaW5pdC5qcycpO1xuLy9cbm1vZHVsZS5kaXJlY3RpdmUoJ3FqYXBpaW5mbycsIGZ1bmN0aW9uKCkge1xuXHR2YXIgZGlyZWN0aXZlID0ge307XG5cdGRpcmVjdGl2ZS5yZXN0cmljdCA9ICdFJzsgLyogcmVzdHJpY3QgdGhpcyBkaXJlY3RpdmUgdG8gZWxlbWVudHMgKi9cblx0ZGlyZWN0aXZlLnRlbXBsYXRlVXJsID0gXCJwYWdlcy9jb250cm9scy9xamFwaWluZm8uaHRtbFwiO1xuXHRkaXJlY3RpdmUuY29tcGlsZSA9IGZ1bmN0aW9uKGVsZW1lbnQsIGF0dHJpYnV0ZXMpIHtcblx0XHR2YXIgbGlua0Z1bmN0aW9uID0gZnVuY3Rpb24oJHNjb3BlLCBlbGVtZW50LCBhdHRyaWJ1dGVzKSB7fVxuXHRcdHJldHVybiBsaW5rRnVuY3Rpb247XG5cdH1cblx0cmV0dXJuIGRpcmVjdGl2ZTtcbn0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJodFpreDRcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLlxcXFxkaXJlY3RpdmVzXFxcXHFqYXBpaW5mb0RpcmVjdGl2ZS5qc1wiLFwiLy4uXFxcXGRpcmVjdGl2ZXNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgbW9kdWxlID0gcmVxdWlyZSgnLi9fbW9kdWxlX2luaXQuanMnKTtcbi8vXG5tb2R1bGUuZGlyZWN0aXZlKCdxamJyZWFkY3J1bWInLCBmdW5jdGlvbigkUUpIZWxwZXJGdW5jdGlvbnMpIHtcblx0dmFyIGRpcmVjdGl2ZSA9IHt9O1xuXHRkaXJlY3RpdmUucmVzdHJpY3QgPSAnRSc7IC8qIHJlc3RyaWN0IHRoaXMgZGlyZWN0aXZlIHRvIGVsZW1lbnRzICovXG5cdGRpcmVjdGl2ZS50ZW1wbGF0ZVVybCA9IFwicGFnZXMvbW9kdWxlX2RpcmVjdGl2ZXMvbW9kdWxlLmJyZWFkY3J1bWIuZGlyZWN0aXZlLmh0bWxcIjtcblx0ZGlyZWN0aXZlLnNjb3BlID0ge1xuXHRcdGRhdGE6IFwiPVwiXG5cdH1cblx0ZGlyZWN0aXZlLmNvbXBpbGUgPSBmdW5jdGlvbihlbGVtZW50LCBhdHRyaWJ1dGVzKSB7XG5cdFx0dmFyIGxpbmtGdW5jdGlvbiA9IGZ1bmN0aW9uKCRzY29wZSwgZWxlbWVudCwgYXR0cmlidXRlcykge1xuXG5cdFx0XHQkc2NvcGUuZGF0YS5nb3RvID0gZnVuY3Rpb24oaXRlbSkge1xuXHRcdFx0XHQkUUpIZWxwZXJGdW5jdGlvbnMuY2hhbmdlU3RhdGUoaXRlbS5zdGF0ZSwgaXRlbS5wYXJhbXMpO1xuXHRcdFx0fTtcblxuXHRcdH1cblx0XHRyZXR1cm4gbGlua0Z1bmN0aW9uO1xuXHR9XG5cdHJldHVybiBkaXJlY3RpdmU7XG59KTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiaHRaa3g0XCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi5cXFxcZGlyZWN0aXZlc1xcXFxxamJyZWFkY3J1bWJEaXJlY3RpdmUuanNcIixcIi8uLlxcXFxkaXJlY3RpdmVzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLyohXG4gKiBBdXRob3I6IEFiZHVsbGFoIEEgQWxtc2FlZWRcbiAqIERhdGU6IDQgSmFuIDIwMTRcbiAqIERlc2NyaXB0aW9uOlxuICogICAgICBUaGlzIGZpbGUgc2hvdWxkIGJlIGluY2x1ZGVkIGluIGFsbCBwYWdlc1xuICEqKi9cblxuLypcbiAqIEdsb2JhbCB2YXJpYWJsZXMuIElmIHlvdSBjaGFuZ2UgYW55IG9mIHRoZXNlIHZhcnMsIGRvbid0IGZvcmdldCBcbiAqIHRvIGNoYW5nZSB0aGUgdmFsdWVzIGluIHRoZSBsZXNzIGZpbGVzIVxuICovXG52YXIgbGVmdF9zaWRlX3dpZHRoID0gMjIwOyAvL1NpZGViYXIgd2lkdGggaW4gcGl4ZWxzXG5cbiQoZnVuY3Rpb24oKSB7XG4gICAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgICAvL0VuYWJsZSBzaWRlYmFyIHRvZ2dsZVxuICAgICQoXCJbZGF0YS10b2dnbGU9J29mZmNhbnZhcyddXCIpLmNsaWNrKGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gICAgICAgIC8vSWYgd2luZG93IGlzIHNtYWxsIGVub3VnaCwgZW5hYmxlIHNpZGViYXIgcHVzaCBtZW51XG4gICAgICAgIGlmICgkKHdpbmRvdykud2lkdGgoKSA8PSA5OTIpIHtcbiAgICAgICAgICAgICQoJy5yb3ctb2ZmY2FudmFzJykudG9nZ2xlQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgJCgnLmxlZnQtc2lkZScpLnJlbW92ZUNsYXNzKFwiY29sbGFwc2UtbGVmdFwiKTtcbiAgICAgICAgICAgICQoXCIucmlnaHQtc2lkZVwiKS5yZW1vdmVDbGFzcyhcInN0cmVjaFwiKTtcbiAgICAgICAgICAgICQoJy5yb3ctb2ZmY2FudmFzJykudG9nZ2xlQ2xhc3MoXCJyZWxhdGl2ZVwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vRWxzZSwgZW5hYmxlIGNvbnRlbnQgc3RyZWNoaW5nXG4gICAgICAgICAgICAkKCcubGVmdC1zaWRlJykudG9nZ2xlQ2xhc3MoXCJjb2xsYXBzZS1sZWZ0XCIpO1xuICAgICAgICAgICAgJChcIi5yaWdodC1zaWRlXCIpLnRvZ2dsZUNsYXNzKFwic3RyZWNoXCIpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvL0FkZCBob3ZlciBzdXBwb3J0IGZvciB0b3VjaCBkZXZpY2VzXG4gICAgJCgnLmJ0bicpLmJpbmQoJ3RvdWNoc3RhcnQnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgJCh0aGlzKS5hZGRDbGFzcygnaG92ZXInKTtcbiAgICB9KS5iaW5kKCd0b3VjaGVuZCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICAkKHRoaXMpLnJlbW92ZUNsYXNzKCdob3ZlcicpO1xuICAgIH0pO1xuXG4gICAgLy9BY3RpdmF0ZSB0b29sdGlwc1xuICAgICQoXCJbZGF0YS10b2dnbGU9J3Rvb2x0aXAnXVwiKS50b29sdGlwKCk7XG5cbiAgICAvKiAgICAgXG4gICAgICogQWRkIGNvbGxhcHNlIGFuZCByZW1vdmUgZXZlbnRzIHRvIGJveGVzXG4gICAgICovXG4gICAgJChcIltkYXRhLXdpZGdldD0nY29sbGFwc2UnXVwiKS5jbGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgLy9GaW5kIHRoZSBib3ggcGFyZW50ICAgICAgICBcbiAgICAgICAgdmFyIGJveCA9ICQodGhpcykucGFyZW50cyhcIi5ib3hcIikuZmlyc3QoKTtcbiAgICAgICAgLy9GaW5kIHRoZSBib2R5IGFuZCB0aGUgZm9vdGVyXG4gICAgICAgIHZhciBiZiA9IGJveC5maW5kKFwiLmJveC1ib2R5LCAuYm94LWZvb3RlclwiKTtcbiAgICAgICAgaWYgKCFib3guaGFzQ2xhc3MoXCJjb2xsYXBzZWQtYm94XCIpKSB7XG4gICAgICAgICAgICBib3guYWRkQ2xhc3MoXCJjb2xsYXBzZWQtYm94XCIpO1xuICAgICAgICAgICAgYmYuc2xpZGVVcCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYm94LnJlbW92ZUNsYXNzKFwiY29sbGFwc2VkLWJveFwiKTtcbiAgICAgICAgICAgIGJmLnNsaWRlRG93bigpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvKlxuICAgICAqIEFERCBTTElNU0NST0xMIFRPIFRIRSBUT1AgTkFWIERST1BET1dOU1xuICAgICAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAqL1xuICAgICQoXCIubmF2YmFyIC5tZW51XCIpLnNsaW1zY3JvbGwoe1xuICAgICAgICBoZWlnaHQ6IFwiMjAwcHhcIixcbiAgICAgICAgYWx3YXlzVmlzaWJsZTogZmFsc2UsXG4gICAgICAgIHNpemU6IFwiM3B4XCJcbiAgICB9KS5jc3MoXCJ3aWR0aFwiLCBcIjEwMCVcIik7XG5cbiAgICAvKlxuICAgICAqIElOSVRJQUxJWkUgQlVUVE9OIFRPR0dMRVxuICAgICAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAqL1xuICAgICQoJy5idG4tZ3JvdXBbZGF0YS10b2dnbGU9XCJidG4tdG9nZ2xlXCJdJykuZWFjaChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGdyb3VwID0gJCh0aGlzKTtcbiAgICAgICAgJCh0aGlzKS5maW5kKFwiLmJ0blwiKS5jbGljayhmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBncm91cC5maW5kKFwiLmJ0bi5hY3RpdmVcIikucmVtb3ZlQ2xhc3MoXCJhY3RpdmVcIik7XG4gICAgICAgICAgICAkKHRoaXMpLmFkZENsYXNzKFwiYWN0aXZlXCIpO1xuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB9KTtcblxuICAgIH0pO1xuXG4gICAgJChcIltkYXRhLXdpZGdldD0ncmVtb3ZlJ11cIikuY2xpY2soZnVuY3Rpb24oKSB7XG4gICAgICAgIC8vRmluZCB0aGUgYm94IHBhcmVudCAgICAgICAgXG4gICAgICAgIHZhciBib3ggPSAkKHRoaXMpLnBhcmVudHMoXCIuYm94XCIpLmZpcnN0KCk7XG4gICAgICAgIGJveC5zbGlkZVVwKCk7XG4gICAgfSk7XG5cbiAgICAvKiBTaWRlYmFyIHRyZWUgdmlldyAqL1xuICAgICQoXCIuc2lkZWJhciAudHJlZXZpZXdcIikudHJlZSgpO1xuXG4gICAgLyogXG4gICAgICogTWFrZSBzdXJlIHRoYXQgdGhlIHNpZGViYXIgaXMgc3RyZWNoZWQgZnVsbCBoZWlnaHRcbiAgICAgKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgKiBXZSBhcmUgZ29ubmEgYXNzaWduIGEgbWluLWhlaWdodCB2YWx1ZSBldmVyeSB0aW1lIHRoZVxuICAgICAqIHdyYXBwZXIgZ2V0cyByZXNpemVkIGFuZCB1cG9uIHBhZ2UgbG9hZC4gV2Ugd2lsbCB1c2VcbiAgICAgKiBCZW4gQWxtYW4ncyBtZXRob2QgZm9yIGRldGVjdGluZyB0aGUgcmVzaXplIGV2ZW50LlxuICAgICAqIFxuICAgICAqKi9cbiAgICBmdW5jdGlvbiBfZml4KCkge1xuICAgICAgICAvL0dldCB3aW5kb3cgaGVpZ2h0IGFuZCB0aGUgd3JhcHBlciBoZWlnaHRcbiAgICAgICAgdmFyIGhlaWdodCA9ICQod2luZG93KS5oZWlnaHQoKSAtICQoXCJib2R5ID4gLmhlYWRlclwiKS5oZWlnaHQoKTtcbiAgICAgICAgJChcIi53cmFwcGVyXCIpLmNzcyhcIm1pbi1oZWlnaHRcIiwgaGVpZ2h0ICsgXCJweFwiKTtcbiAgICAgICAgdmFyIGNvbnRlbnQgPSAkKFwiLnJpZ2h0LXNpZGVcIikuaGVpZ2h0KCk7XG4gICAgICAgIC8vSWYgdGhlIHdyYXBwZXIgaGVpZ2h0IGlzIGdyZWF0ZXIgdGhhbiB0aGUgd2luZG93XG4gICAgICAgIGlmIChjb250ZW50ID4gaGVpZ2h0KVxuICAgICAgICAgICAgLy90aGVuIHNldCBzaWRlYmFyIGhlaWdodCB0byB0aGUgd3JhcHBlclxuICAgICAgICAgICAgJChcIi5sZWZ0LXNpZGUsIGh0bWwsIGJvZHlcIikuY3NzKFwibWluLWhlaWdodFwiLCBjb250ZW50ICsgXCJweFwiKTtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAvL090aGVyd2lzZSwgc2V0IHRoZSBzaWRlYmFyIHRvIHRoZSBoZWlnaHQgb2YgdGhlIHdpbmRvd1xuICAgICAgICAgICAgJChcIi5sZWZ0LXNpZGUsIGh0bWwsIGJvZHlcIikuY3NzKFwibWluLWhlaWdodFwiLCBoZWlnaHQgKyBcInB4XCIpO1xuICAgICAgICB9XG4gICAgfVxuICAgIC8vRmlyZSB1cG9uIGxvYWRcbiAgICBfZml4KCk7XG4gICAgLy9GaXJlIHdoZW4gd3JhcHBlciBpcyByZXNpemVkXG4gICAgJChcIi53cmFwcGVyXCIpLnJlc2l6ZShmdW5jdGlvbigpIHtcbiAgICAgICAgX2ZpeCgpO1xuICAgICAgICBmaXhfc2lkZWJhcigpO1xuICAgIH0pO1xuXG4gICAgLy9GaXggdGhlIGZpeGVkIGxheW91dCBzaWRlYmFyIHNjcm9sbCBidWdcbiAgICBmaXhfc2lkZWJhcigpO1xuXG4gICAgLypcbiAgICAgKiBXZSBhcmUgZ29ubmEgaW5pdGlhbGl6ZSBhbGwgY2hlY2tib3ggYW5kIHJhZGlvIGlucHV0cyB0byBcbiAgICAgKiBpQ2hlY2sgcGx1Z2luIGluLlxuICAgICAqIFlvdSBjYW4gZmluZCB0aGUgZG9jdW1lbnRhdGlvbiBhdCBodHRwOi8vZnJvbnRlZWQuY29tL2lDaGVjay9cbiAgICAgKi9cbiAgICAkKFwiaW5wdXRbdHlwZT0nY2hlY2tib3gnXSwgaW5wdXRbdHlwZT0ncmFkaW8nXVwiKS5pQ2hlY2soe1xuICAgICAgICBjaGVja2JveENsYXNzOiAnaWNoZWNrYm94X21pbmltYWwnLFxuICAgICAgICByYWRpb0NsYXNzOiAnaXJhZGlvX21pbmltYWwnXG4gICAgfSk7XG5cbn0pO1xuZnVuY3Rpb24gZml4X3NpZGViYXIoKSB7XG4gICAgLy9NYWtlIHN1cmUgdGhlIGJvZHkgdGFnIGhhcyB0aGUgLmZpeGVkIGNsYXNzXG4gICAgaWYgKCEkKFwiYm9keVwiKS5oYXNDbGFzcyhcImZpeGVkXCIpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvL0FkZCBzbGltc2Nyb2xsXG4gICAgJChcIi5zaWRlYmFyXCIpLnNsaW1zY3JvbGwoe1xuICAgICAgICBoZWlnaHQ6ICgkKHdpbmRvdykuaGVpZ2h0KCkgLSAkKFwiLmhlYWRlclwiKS5oZWlnaHQoKSkgKyBcInB4XCIsXG4gICAgICAgIGNvbG9yOiBcInJnYmEoMCwwLDAsMC4yKVwiXG4gICAgfSk7XG59XG5mdW5jdGlvbiBjaGFuZ2VfbGF5b3V0KCkge1xuICAgICQoXCJib2R5XCIpLnRvZ2dsZUNsYXNzKFwiZml4ZWRcIik7XG4gICAgZml4X3NpZGViYXIoKTtcbn1cbmZ1bmN0aW9uIGNoYW5nZV9za2luKGNscykge1xuICAgICQoXCJib2R5XCIpLnJlbW92ZUNsYXNzKFwic2tpbi1ibHVlIHNraW4tYmxhY2tcIik7XG4gICAgJChcImJvZHlcIikuYWRkQ2xhc3MoY2xzKTtcbn1cbi8qRU5EIERFTU8qL1xuJCh3aW5kb3cpLmxvYWQoZnVuY3Rpb24oKSB7XG4gICAgLyohIHBhY2UgMC40LjE3ICovXG4gICAgKGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYSwgYiwgYywgZCwgZSwgZiwgZywgaCwgaSwgaiwgaywgbCwgbSwgbiwgbywgcCwgcSwgciwgcywgdCwgdSwgdiwgdywgeCwgeSwgeiwgQSwgQiwgQywgRCwgRSwgRiwgRywgSCwgSSwgSiwgSywgTCwgTSwgTiwgTywgUCwgUSwgUiwgUywgVCwgVSwgViA9IFtdLnNsaWNlLCBXID0ge30uaGFzT3duUHJvcGVydHksIFggPSBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICBmdW5jdGlvbiBjKCkge1xuICAgICAgICAgICAgICAgIHRoaXMuY29uc3RydWN0b3IgPSBhXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKHZhciBkIGluIGIpXG4gICAgICAgICAgICAgICAgVy5jYWxsKGIsIGQpICYmIChhW2RdID0gYltkXSk7XG4gICAgICAgICAgICByZXR1cm4gYy5wcm90b3R5cGUgPSBiLnByb3RvdHlwZSwgYS5wcm90b3R5cGUgPSBuZXcgYywgYS5fX3N1cGVyX18gPSBiLnByb3RvdHlwZSwgYVxuICAgICAgICB9LCBZID0gW10uaW5kZXhPZiB8fCBmdW5jdGlvbihhKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBiID0gMCwgYyA9IHRoaXMubGVuZ3RoOyBjID4gYjsgYisrKVxuICAgICAgICAgICAgICAgIGlmIChiIGluIHRoaXMgJiYgdGhpc1tiXSA9PT0gYSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGI7XG4gICAgICAgICAgICByZXR1cm4tMVxuICAgICAgICB9O1xuICAgICAgICBmb3IgKHQgPSB7Y2F0Y2h1cFRpbWU6NTAwLCBpbml0aWFsUmF0ZTouMDMsIG1pblRpbWU6NTAwLCBnaG9zdFRpbWU6NTAwLCBtYXhQcm9ncmVzc1BlckZyYW1lOjEwLCBlYXNlRmFjdG9yOjEuMjUsIHN0YXJ0T25QYWdlTG9hZDohMCwgcmVzdGFydE9uUHVzaFN0YXRlOiEwLCByZXN0YXJ0T25SZXF1ZXN0QWZ0ZXI6NTAwLCB0YXJnZXQ6XCJib2R5XCIsIGVsZW1lbnRzOntjaGVja0ludGVydmFsOjEwMCwgc2VsZWN0b3JzOltcImJvZHlcIl19LCBldmVudExhZzp7bWluU2FtcGxlczoxMCwgc2FtcGxlQ291bnQ6MywgbGFnVGhyZXNob2xkOjN9LCBhamF4Ont0cmFja01ldGhvZHM6W1wiR0VUXCJdLCB0cmFja1dlYlNvY2tldHM6ITF9fSwgQiA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyIGE7XG4gICAgICAgICAgICByZXR1cm4gbnVsbCAhPSAoYSA9IFwidW5kZWZpbmVkXCIgIT0gdHlwZW9mIHBlcmZvcm1hbmNlICYmIG51bGwgIT09IHBlcmZvcm1hbmNlID8gXCJmdW5jdGlvblwiID09IHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPyBwZXJmb3JtYW5jZS5ub3coKSA6IHZvaWQgMCA6IHZvaWQgMCkgPyBhIDogK25ldyBEYXRlXG4gICAgICAgIH0sIEQgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8IHdpbmRvdy5tb3pSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHwgd2luZG93LndlYmtpdFJlcXVlc3RBbmltYXRpb25GcmFtZSB8fCB3aW5kb3cubXNSZXF1ZXN0QW5pbWF0aW9uRnJhbWUsIHMgPSB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUgfHwgd2luZG93Lm1vekNhbmNlbEFuaW1hdGlvbkZyYW1lLCBudWxsID09IEQgJiYgKEQgPSBmdW5jdGlvbihhKSB7XG4gICAgICAgICAgICByZXR1cm4gc2V0VGltZW91dChhLCA1MClcbiAgICAgICAgfSwgcyA9IGZ1bmN0aW9uKGEpIHtcbiAgICAgICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQoYSlcbiAgICAgICAgfSksIEYgPSBmdW5jdGlvbihhKSB7XG4gICAgICAgICAgICB2YXIgYiwgYztcbiAgICAgICAgICAgIHJldHVybiBiID0gQigpLCAoYyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHZhciBkO1xuICAgICAgICAgICAgICAgIHJldHVybiBkID0gQigpIC0gYiwgZCA+PSAzMyA/IChiID0gQigpLCBhKGQsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gRChjKVxuICAgICAgICAgICAgICAgIH0pKSA6IHNldFRpbWVvdXQoYywgMzMgLSBkKVxuICAgICAgICAgICAgfSkoKVxuICAgICAgICB9LCBFID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2YXIgYSwgYiwgYztcbiAgICAgICAgICAgIHJldHVybiBjID0gYXJndW1lbnRzWzBdLCBiID0gYXJndW1lbnRzWzFdLCBhID0gMyA8PSBhcmd1bWVudHMubGVuZ3RoID8gVi5jYWxsKGFyZ3VtZW50cywgMikgOiBbXSwgXCJmdW5jdGlvblwiID09IHR5cGVvZiBjW2JdID8gY1tiXS5hcHBseShjLCBhKSA6IGNbYl1cbiAgICAgICAgfSwgdSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyIGEsIGIsIGMsIGQsIGUsIGYsIGc7XG4gICAgICAgICAgICBmb3IgKGIgPSBhcmd1bWVudHNbMF0sIGQgPSAyIDw9IGFyZ3VtZW50cy5sZW5ndGg/Vi5jYWxsKGFyZ3VtZW50cywgMSk6W10sIGYgPSAwLCBnID0gZC5sZW5ndGg7IGcgPiBmOyBmKyspXG4gICAgICAgICAgICAgICAgaWYgKGMgPSBkW2ZdKVxuICAgICAgICAgICAgICAgICAgICBmb3IgKGEgaW4gYylcbiAgICAgICAgICAgICAgICAgICAgICAgIFcuY2FsbChjLCBhKSAmJiAoZSA9IGNbYV0sIG51bGwgIT0gYlthXSAmJiBcIm9iamVjdFwiID09IHR5cGVvZiBiW2FdICYmIG51bGwgIT0gZSAmJiBcIm9iamVjdFwiID09IHR5cGVvZiBlID8gdShiW2FdLCBlKSA6IGJbYV0gPSBlKTtcbiAgICAgICAgICAgIHJldHVybiBiXG4gICAgICAgIH0sIHAgPSBmdW5jdGlvbihhKSB7XG4gICAgICAgICAgICB2YXIgYiwgYywgZCwgZSwgZjtcbiAgICAgICAgICAgIGZvciAoYyA9IGIgPSAwLCBlID0gMCwgZiA9IGEubGVuZ3RoOyBmID4gZTsgZSsrKVxuICAgICAgICAgICAgICAgIGQgPSBhW2VdLCBjICs9IE1hdGguYWJzKGQpLCBiKys7XG4gICAgICAgICAgICByZXR1cm4gYyAvIGJcbiAgICAgICAgfSwgdyA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHZhciBjLCBkLCBlO1xuICAgICAgICAgICAgaWYgKG51bGwgPT0gYSAmJiAoYSA9IFwib3B0aW9uc1wiKSwgbnVsbCA9PSBiICYmIChiID0gITApLCBlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIltkYXRhLXBhY2UtXCIgKyBhICsgXCJdXCIpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGMgPSBlLmdldEF0dHJpYnV0ZShcImRhdGEtcGFjZS1cIiArIGEpLCAhYilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGM7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UoYylcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChmKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBkID0gZiwgXCJ1bmRlZmluZWRcIiAhPSB0eXBlb2YgY29uc29sZSAmJiBudWxsICE9PSBjb25zb2xlID8gY29uc29sZS5lcnJvcihcIkVycm9yIHBhcnNpbmcgaW5saW5lIHBhY2Ugb3B0aW9uc1wiLCBkKSA6IHZvaWQgMFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgZyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgZnVuY3Rpb24gYSgpIHtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBhLnByb3RvdHlwZS5vbiA9IGZ1bmN0aW9uKGEsIGIsIGMsIGQpIHtcbiAgICAgICAgICAgICAgICB2YXIgZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbCA9PSBkICYmIChkID0gITEpLCBudWxsID09IHRoaXMuYmluZGluZ3MgJiYgKHRoaXMuYmluZGluZ3MgPSB7fSksIG51bGwgPT0gKGUgPSB0aGlzLmJpbmRpbmdzKVthXSAmJiAoZVthXSA9IFtdKSwgdGhpcy5iaW5kaW5nc1thXS5wdXNoKHtoYW5kbGVyOiBiLCBjdHg6IGMsIG9uY2U6IGR9KVxuICAgICAgICAgICAgfSwgYS5wcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uKGEsIGIsIGMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5vbihhLCBiLCBjLCAhMClcbiAgICAgICAgICAgIH0sIGEucHJvdG90eXBlLm9mZiA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgICAgICB2YXIgYywgZCwgZTtcbiAgICAgICAgICAgICAgICBpZiAobnVsbCAhPSAobnVsbCAhPSAoZCA9IHRoaXMuYmluZGluZ3MpID8gZFthXSA6IHZvaWQgMCkpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG51bGwgPT0gYilcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBkZWxldGUgdGhpcy5iaW5kaW5nc1thXTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjID0gMCwgZSA9IFtdOyBjIDwgdGhpcy5iaW5kaW5nc1thXS5sZW5ndGg7IClcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYmluZGluZ3NbYV1bY10uaGFuZGxlciA9PT0gYiA/IGUucHVzaCh0aGlzLmJpbmRpbmdzW2FdLnNwbGljZShjLCAxKSkgOiBlLnB1c2goYysrKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGVcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCBhLnByb3RvdHlwZS50cmlnZ2VyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdmFyIGEsIGIsIGMsIGQsIGUsIGYsIGcsIGgsIGk7XG4gICAgICAgICAgICAgICAgaWYgKGMgPSBhcmd1bWVudHNbMF0sIGEgPSAyIDw9IGFyZ3VtZW50cy5sZW5ndGggPyBWLmNhbGwoYXJndW1lbnRzLCAxKSA6IFtdLCBudWxsICE9IChnID0gdGhpcy5iaW5kaW5ncykgPyBnW2NdIDogdm9pZCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoZSA9IDAsIGkgPSBbXTsgZSA8IHRoaXMuYmluZGluZ3NbY10ubGVuZ3RoOyApXG4gICAgICAgICAgICAgICAgICAgICAgICBoID0gdGhpcy5iaW5kaW5nc1tjXVtlXSwgZCA9IGguaGFuZGxlciwgYiA9IGguY3R4LCBmID0gaC5vbmNlLCBkLmFwcGx5KG51bGwgIT0gYiA/IGIgOiB0aGlzLCBhKSwgZiA/IGkucHVzaCh0aGlzLmJpbmRpbmdzW2NdLnNwbGljZShlLCAxKSkgOiBpLnB1c2goZSsrKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCBhXG4gICAgICAgIH0oKSwgbnVsbCA9PSB3aW5kb3cuUGFjZSAmJiAod2luZG93LlBhY2UgPSB7fSksIHUoUGFjZSwgZy5wcm90b3R5cGUpLCBDID0gUGFjZS5vcHRpb25zID0gdSh7fSwgdCwgd2luZG93LnBhY2VPcHRpb25zLCB3KCkpLCBTID0gW1wiYWpheFwiLCBcImRvY3VtZW50XCIsIFwiZXZlbnRMYWdcIiwgXCJlbGVtZW50c1wiXSwgTyA9IDAsIFEgPSBTLmxlbmd0aDsgUSA+IE87IE8rKylcbiAgICAgICAgICAgIEkgPSBTW09dLCBDW0ldID09PSAhMCAmJiAoQ1tJXSA9IHRbSV0pO1xuICAgICAgICBpID0gZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgZnVuY3Rpb24gYigpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gVCA9IGIuX19zdXBlcl9fLmNvbnN0cnVjdG9yLmFwcGx5KHRoaXMsIGFyZ3VtZW50cylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBYKGIsIGEpLCBiXG4gICAgICAgIH0oRXJyb3IpLCBiID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBmdW5jdGlvbiBhKCkge1xuICAgICAgICAgICAgICAgIHRoaXMucHJvZ3Jlc3MgPSAwXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gYS5wcm90b3R5cGUuZ2V0RWxlbWVudCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHZhciBhO1xuICAgICAgICAgICAgICAgIGlmIChudWxsID09IHRoaXMuZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGEgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKEMudGFyZ2V0KSwgIWEpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgaTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHRoaXMuZWwuY2xhc3NOYW1lID0gXCJwYWNlIHBhY2UtYWN0aXZlXCIsIGRvY3VtZW50LmJvZHkuY2xhc3NOYW1lID0gZG9jdW1lbnQuYm9keS5jbGFzc05hbWUucmVwbGFjZShcInBhY2UtZG9uZVwiLCBcIlwiKSwgZG9jdW1lbnQuYm9keS5jbGFzc05hbWUgKz0gXCIgcGFjZS1ydW5uaW5nXCIsIHRoaXMuZWwuaW5uZXJIVE1MID0gJzxkaXYgY2xhc3M9XCJwYWNlLXByb2dyZXNzXCI+XFxuICA8ZGl2IGNsYXNzPVwicGFjZS1wcm9ncmVzcy1pbm5lclwiPjwvZGl2PlxcbjwvZGl2PlxcbjxkaXYgY2xhc3M9XCJwYWNlLWFjdGl2aXR5XCI+PC9kaXY+JywgbnVsbCAhPSBhLmZpcnN0Q2hpbGQgPyBhLmluc2VydEJlZm9yZSh0aGlzLmVsLCBhLmZpcnN0Q2hpbGQpIDogYS5hcHBlbmRDaGlsZCh0aGlzLmVsKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5lbFxuICAgICAgICAgICAgfSwgYS5wcm90b3R5cGUuZmluaXNoID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdmFyIGE7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGEgPSB0aGlzLmdldEVsZW1lbnQoKSwgYS5jbGFzc05hbWUgPSBhLmNsYXNzTmFtZS5yZXBsYWNlKFwicGFjZS1hY3RpdmVcIiwgXCJcIiksIGEuY2xhc3NOYW1lICs9IFwiIHBhY2UtaW5hY3RpdmVcIiwgZG9jdW1lbnQuYm9keS5jbGFzc05hbWUgPSBkb2N1bWVudC5ib2R5LmNsYXNzTmFtZS5yZXBsYWNlKFwicGFjZS1ydW5uaW5nXCIsIFwiXCIpLCBkb2N1bWVudC5ib2R5LmNsYXNzTmFtZSArPSBcIiBwYWNlLWRvbmVcIlxuICAgICAgICAgICAgfSwgYS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnByb2dyZXNzID0gYSwgdGhpcy5yZW5kZXIoKVxuICAgICAgICAgICAgfSwgYS5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ2V0RWxlbWVudCgpLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5nZXRFbGVtZW50KCkpXG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoYSkge1xuICAgICAgICAgICAgICAgICAgICBpID0gYVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5lbCA9IHZvaWQgMFxuICAgICAgICAgICAgfSwgYS5wcm90b3R5cGUucmVuZGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdmFyIGEsIGI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGwgPT0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDLnRhcmdldCkgPyAhMSA6IChhID0gdGhpcy5nZXRFbGVtZW50KCksIGEuY2hpbGRyZW5bMF0uc3R5bGUud2lkdGggPSBcIlwiICsgdGhpcy5wcm9ncmVzcyArIFwiJVwiLCAoIXRoaXMubGFzdFJlbmRlcmVkUHJvZ3Jlc3MgfHwgdGhpcy5sYXN0UmVuZGVyZWRQcm9ncmVzcyB8IDAgIT09IHRoaXMucHJvZ3Jlc3MgfCAwKSAmJiAoYS5jaGlsZHJlblswXS5zZXRBdHRyaWJ1dGUoXCJkYXRhLXByb2dyZXNzLXRleHRcIiwgXCJcIiArICgwIHwgdGhpcy5wcm9ncmVzcykgKyBcIiVcIiksIHRoaXMucHJvZ3Jlc3MgPj0gMTAwID8gYiA9IFwiOTlcIiA6IChiID0gdGhpcy5wcm9ncmVzcyA8IDEwID8gXCIwXCIgOiBcIlwiLCBiICs9IDAgfCB0aGlzLnByb2dyZXNzKSwgYS5jaGlsZHJlblswXS5zZXRBdHRyaWJ1dGUoXCJkYXRhLXByb2dyZXNzXCIsIFwiXCIgKyBiKSksIHRoaXMubGFzdFJlbmRlcmVkUHJvZ3Jlc3MgPSB0aGlzLnByb2dyZXNzKVxuICAgICAgICAgICAgfSwgYS5wcm90b3R5cGUuZG9uZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnByb2dyZXNzID49IDEwMFxuICAgICAgICAgICAgfSwgYVxuICAgICAgICB9KCksIGggPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uIGEoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5iaW5kaW5ncyA9IHt9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gYS5wcm90b3R5cGUudHJpZ2dlciA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgICAgICB2YXIgYywgZCwgZSwgZiwgZztcbiAgICAgICAgICAgICAgICBpZiAobnVsbCAhPSB0aGlzLmJpbmRpbmdzW2FdKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoZiA9IHRoaXMuYmluZGluZ3NbYV0sIGcgPSBbXSwgZCA9IDAsIGUgPSBmLmxlbmd0aDsgZSA+IGQ7IGQrKylcbiAgICAgICAgICAgICAgICAgICAgICAgIGMgPSBmW2RdLCBnLnB1c2goYy5jYWxsKHRoaXMsIGIpKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCBhLnByb3RvdHlwZS5vbiA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgICAgICB2YXIgYztcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbCA9PSAoYyA9IHRoaXMuYmluZGluZ3MpW2FdICYmIChjW2FdID0gW10pLCB0aGlzLmJpbmRpbmdzW2FdLnB1c2goYilcbiAgICAgICAgICAgIH0sIGFcbiAgICAgICAgfSgpLCBOID0gd2luZG93LlhNTEh0dHBSZXF1ZXN0LCBNID0gd2luZG93LlhEb21haW5SZXF1ZXN0LCBMID0gd2luZG93LldlYlNvY2tldCwgdiA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHZhciBjLCBkLCBlLCBmO1xuICAgICAgICAgICAgZiA9IFtdO1xuICAgICAgICAgICAgZm9yIChkIGluIGIucHJvdG90eXBlKVxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGUgPSBiLnByb3RvdHlwZVtkXSwgbnVsbCA9PSBhW2RdICYmIFwiZnVuY3Rpb25cIiAhPSB0eXBlb2YgZSA/IGYucHVzaChhW2RdID0gZSkgOiBmLnB1c2godm9pZCAwKVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGcpIHtcbiAgICAgICAgICAgICAgICAgICAgYyA9IGdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZlxuICAgICAgICB9LCB6ID0gW10sIFBhY2UuaWdub3JlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2YXIgYSwgYiwgYztcbiAgICAgICAgICAgIHJldHVybiBiID0gYXJndW1lbnRzWzBdLCBhID0gMiA8PSBhcmd1bWVudHMubGVuZ3RoID8gVi5jYWxsKGFyZ3VtZW50cywgMSkgOiBbXSwgei51bnNoaWZ0KFwiaWdub3JlXCIpLCBjID0gYi5hcHBseShudWxsLCBhKSwgei5zaGlmdCgpLCBjXG4gICAgICAgIH0sIFBhY2UudHJhY2sgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciBhLCBiLCBjO1xuICAgICAgICAgICAgcmV0dXJuIGIgPSBhcmd1bWVudHNbMF0sIGEgPSAyIDw9IGFyZ3VtZW50cy5sZW5ndGggPyBWLmNhbGwoYXJndW1lbnRzLCAxKSA6IFtdLCB6LnVuc2hpZnQoXCJ0cmFja1wiKSwgYyA9IGIuYXBwbHkobnVsbCwgYSksIHouc2hpZnQoKSwgY1xuICAgICAgICB9LCBIID0gZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgdmFyIGI7XG4gICAgICAgICAgICBpZiAobnVsbCA9PSBhICYmIChhID0gXCJHRVRcIiksIFwidHJhY2tcIiA9PT0gelswXSlcbiAgICAgICAgICAgICAgICByZXR1cm5cImZvcmNlXCI7XG4gICAgICAgICAgICBpZiAoIXoubGVuZ3RoICYmIEMuYWpheCkge1xuICAgICAgICAgICAgICAgIGlmIChcInNvY2tldFwiID09PSBhICYmIEMuYWpheC50cmFja1dlYlNvY2tldHMpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiEwO1xuICAgICAgICAgICAgICAgIGlmIChiID0gYS50b1VwcGVyQ2FzZSgpLCBZLmNhbGwoQy5hamF4LnRyYWNrTWV0aG9kcywgYikgPj0gMClcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuITBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiExXG4gICAgICAgIH0sIGogPSBmdW5jdGlvbihhKSB7XG4gICAgICAgICAgICBmdW5jdGlvbiBiKCkge1xuICAgICAgICAgICAgICAgIHZhciBhLCBjID0gdGhpcztcbiAgICAgICAgICAgICAgICBiLl9fc3VwZXJfXy5jb25zdHJ1Y3Rvci5hcHBseSh0aGlzLCBhcmd1bWVudHMpLCBhID0gZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYjtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGIgPSBhLm9wZW4sIGEub3BlbiA9IGZ1bmN0aW9uKGQsIGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBIKGQpICYmIGMudHJpZ2dlcihcInJlcXVlc3RcIiwge3R5cGU6IGQsIHVybDogZSwgcmVxdWVzdDogYX0pLCBiLmFwcGx5KGEsIGFyZ3VtZW50cylcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sIHdpbmRvdy5YTUxIdHRwUmVxdWVzdCA9IGZ1bmN0aW9uKGIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGM7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjID0gbmV3IE4oYiksIGEoYyksIGNcbiAgICAgICAgICAgICAgICB9LCB2KHdpbmRvdy5YTUxIdHRwUmVxdWVzdCwgTiksIG51bGwgIT0gTSAmJiAod2luZG93LlhEb21haW5SZXF1ZXN0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBiO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYiA9IG5ldyBNLCBhKGIpLCBiXG4gICAgICAgICAgICAgICAgfSwgdih3aW5kb3cuWERvbWFpblJlcXVlc3QsIE0pKSwgbnVsbCAhPSBMICYmIEMuYWpheC50cmFja1dlYlNvY2tldHMgJiYgKHdpbmRvdy5XZWJTb2NrZXQgPSBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBkO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZCA9IG5ldyBMKGEsIGIpLCBIKFwic29ja2V0XCIpICYmIGMudHJpZ2dlcihcInJlcXVlc3RcIiwge3R5cGU6IFwic29ja2V0XCIsIHVybDogYSwgcHJvdG9jb2xzOiBiLCByZXF1ZXN0OiBkfSksIGRcbiAgICAgICAgICAgICAgICB9LCB2KHdpbmRvdy5XZWJTb2NrZXQsIEwpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFgoYiwgYSksIGJcbiAgICAgICAgfShoKSwgUCA9IG51bGwsIHggPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsID09IFAgJiYgKFAgPSBuZXcgaiksIFBcbiAgICAgICAgfSwgeCgpLm9uKFwicmVxdWVzdFwiLCBmdW5jdGlvbihiKSB7XG4gICAgICAgICAgICB2YXIgYywgZCwgZSwgZjtcbiAgICAgICAgICAgIHJldHVybiBmID0gYi50eXBlLCBlID0gYi5yZXF1ZXN0LCBQYWNlLnJ1bm5pbmcgfHwgQy5yZXN0YXJ0T25SZXF1ZXN0QWZ0ZXIgPT09ICExICYmIFwiZm9yY2VcIiAhPT0gSChmKSA/IHZvaWQgMCA6IChkID0gYXJndW1lbnRzLCBjID0gQy5yZXN0YXJ0T25SZXF1ZXN0QWZ0ZXIgfHwgMCwgXCJib29sZWFuXCIgPT0gdHlwZW9mIGMgJiYgKGMgPSAwKSwgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB2YXIgYiwgYywgZywgaCwgaSwgajtcbiAgICAgICAgICAgICAgICBpZiAoYiA9IFwic29ja2V0XCIgPT09IGYgPyBlLnJlYWR5U3RhdGUgPCAyIDogMCA8IChoID0gZS5yZWFkeVN0YXRlKSAmJiA0ID4gaCkge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKFBhY2UucmVzdGFydCgpLCBpID0gUGFjZS5zb3VyY2VzLCBqID0gW10sIGMgPSAwLCBnID0gaS5sZW5ndGg7IGcgPiBjOyBjKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChJID0gaVtjXSwgSSBpbnN0YW5jZW9mIGEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBJLndhdGNoLmFwcGx5KEksIGQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBqLnB1c2godm9pZCAwKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBqXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgYykpXG4gICAgICAgIH0pLCBhID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBmdW5jdGlvbiBhKCkge1xuICAgICAgICAgICAgICAgIHZhciBhID0gdGhpcztcbiAgICAgICAgICAgICAgICB0aGlzLmVsZW1lbnRzID0gW10sIHgoKS5vbihcInJlcXVlc3RcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhLndhdGNoLmFwcGx5KGEsIGFyZ3VtZW50cylcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGEucHJvdG90eXBlLndhdGNoID0gZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgICAgIHZhciBiLCBjLCBkO1xuICAgICAgICAgICAgICAgIHJldHVybiBkID0gYS50eXBlLCBiID0gYS5yZXF1ZXN0LCBjID0gXCJzb2NrZXRcIiA9PT0gZCA/IG5ldyBtKGIpIDogbmV3IG4oYiksIHRoaXMuZWxlbWVudHMucHVzaChjKVxuICAgICAgICAgICAgfSwgYVxuICAgICAgICB9KCksIG4gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uIGEoYSkge1xuICAgICAgICAgICAgICAgIHZhciBiLCBjLCBkLCBlLCBmLCBnLCBoID0gdGhpcztcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5wcm9ncmVzcyA9IDAsIG51bGwgIT0gd2luZG93LlByb2dyZXNzRXZlbnQpXG4gICAgICAgICAgICAgICAgICAgIGZvciAoYyA9IG51bGwsIGEuYWRkRXZlbnRMaXN0ZW5lcihcInByb2dyZXNzXCIsIGZ1bmN0aW9uKGEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBoLnByb2dyZXNzID0gYS5sZW5ndGhDb21wdXRhYmxlID8gMTAwICogYS5sb2FkZWQgLyBhLnRvdGFsIDogaC5wcm9ncmVzcyArICgxMDAgLSBoLnByb2dyZXNzKSAvIDJcbiAgICAgICAgICAgICAgICAgICAgfSksIGcgPSBbXCJsb2FkXCIsIFwiYWJvcnRcIiwgXCJ0aW1lb3V0XCIsIFwiZXJyb3JcIl0sIGQgPSAwLCBlID0gZy5sZW5ndGg7IGUgPiBkOyBkKyspXG4gICAgICAgICAgICAgICAgICAgICAgICBiID0gZ1tkXSwgYS5hZGRFdmVudExpc3RlbmVyKGIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBoLnByb2dyZXNzID0gMTAwXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGYgPSBhLm9ucmVhZHlzdGF0ZWNoYW5nZSwgYS5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBiO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIDAgPT09IChiID0gYS5yZWFkeVN0YXRlKSB8fCA0ID09PSBiID8gaC5wcm9ncmVzcyA9IDEwMCA6IDMgPT09IGEucmVhZHlTdGF0ZSAmJiAoaC5wcm9ncmVzcyA9IDUwKSwgXCJmdW5jdGlvblwiID09IHR5cGVvZiBmID8gZi5hcHBseShudWxsLCBhcmd1bWVudHMpIDogdm9pZCAwXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBhXG4gICAgICAgIH0oKSwgbSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgZnVuY3Rpb24gYShhKSB7XG4gICAgICAgICAgICAgICAgdmFyIGIsIGMsIGQsIGUsIGYgPSB0aGlzO1xuICAgICAgICAgICAgICAgIGZvciAodGhpcy5wcm9ncmVzcyA9IDAsIGUgPSBbXCJlcnJvclwiLCBcIm9wZW5cIl0sIGMgPSAwLCBkID0gZS5sZW5ndGg7IGQgPiBjOyBjKyspXG4gICAgICAgICAgICAgICAgICAgIGIgPSBlW2NdLCBhLmFkZEV2ZW50TGlzdGVuZXIoYiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZi5wcm9ncmVzcyA9IDEwMFxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGFcbiAgICAgICAgfSgpLCBkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBmdW5jdGlvbiBhKGEpIHtcbiAgICAgICAgICAgICAgICB2YXIgYiwgYywgZCwgZjtcbiAgICAgICAgICAgICAgICBmb3IgKG51bGwgPT0gYSAmJiAoYSA9IHt9KSwgdGhpcy5lbGVtZW50cyA9IFtdLCBudWxsID09IGEuc2VsZWN0b3JzICYmIChhLnNlbGVjdG9ycyA9IFtdKSwgZiA9IGEuc2VsZWN0b3JzLCBjID0gMCwgZCA9IGYubGVuZ3RoOyBkID4gYzsgYysrKVxuICAgICAgICAgICAgICAgICAgICBiID0gZltjXSwgdGhpcy5lbGVtZW50cy5wdXNoKG5ldyBlKGIpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGFcbiAgICAgICAgfSgpLCBlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBmdW5jdGlvbiBhKGEpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdG9yID0gYSwgdGhpcy5wcm9ncmVzcyA9IDAsIHRoaXMuY2hlY2soKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGEucHJvdG90eXBlLmNoZWNrID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdmFyIGEgPSB0aGlzO1xuICAgICAgICAgICAgICAgIHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHRoaXMuc2VsZWN0b3IpID8gdGhpcy5kb25lKCkgOiBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYS5jaGVjaygpXG4gICAgICAgICAgICAgICAgfSwgQy5lbGVtZW50cy5jaGVja0ludGVydmFsKVxuICAgICAgICAgICAgfSwgYS5wcm90b3R5cGUuZG9uZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnByb2dyZXNzID0gMTAwXG4gICAgICAgICAgICB9LCBhXG4gICAgICAgIH0oKSwgYyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgZnVuY3Rpb24gYSgpIHtcbiAgICAgICAgICAgICAgICB2YXIgYSwgYiwgYyA9IHRoaXM7XG4gICAgICAgICAgICAgICAgdGhpcy5wcm9ncmVzcyA9IG51bGwgIT0gKGIgPSB0aGlzLnN0YXRlc1tkb2N1bWVudC5yZWFkeVN0YXRlXSkgPyBiIDogMTAwLCBhID0gZG9jdW1lbnQub25yZWFkeXN0YXRlY2hhbmdlLCBkb2N1bWVudC5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGwgIT0gYy5zdGF0ZXNbZG9jdW1lbnQucmVhZHlTdGF0ZV0gJiYgKGMucHJvZ3Jlc3MgPSBjLnN0YXRlc1tkb2N1bWVudC5yZWFkeVN0YXRlXSksIFwiZnVuY3Rpb25cIiA9PSB0eXBlb2YgYSA/IGEuYXBwbHkobnVsbCwgYXJndW1lbnRzKSA6IHZvaWQgMFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBhLnByb3RvdHlwZS5zdGF0ZXMgPSB7bG9hZGluZzogMCwgaW50ZXJhY3RpdmU6IDUwLCBjb21wbGV0ZTogMTAwfSwgYVxuICAgICAgICB9KCksIGYgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uIGEoKSB7XG4gICAgICAgICAgICAgICAgdmFyIGEsIGIsIGMsIGQsIGUsIGYgPSB0aGlzO1xuICAgICAgICAgICAgICAgIHRoaXMucHJvZ3Jlc3MgPSAwLCBhID0gMCwgZSA9IFtdLCBkID0gMCwgYyA9IEIoKSwgYiA9IHNldEludGVydmFsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZztcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGcgPSBCKCkgLSBjIC0gNTAsIGMgPSBCKCksIGUucHVzaChnKSwgZS5sZW5ndGggPiBDLmV2ZW50TGFnLnNhbXBsZUNvdW50ICYmIGUuc2hpZnQoKSwgYSA9IHAoZSksICsrZCA+PSBDLmV2ZW50TGFnLm1pblNhbXBsZXMgJiYgYSA8IEMuZXZlbnRMYWcubGFnVGhyZXNob2xkID8gKGYucHJvZ3Jlc3MgPSAxMDAsIGNsZWFySW50ZXJ2YWwoYikpIDogZi5wcm9ncmVzcyA9IDEwMCAqICgzIC8gKGEgKyAzKSlcbiAgICAgICAgICAgICAgICB9LCA1MClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBhXG4gICAgICAgIH0oKSwgbCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgZnVuY3Rpb24gYShhKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zb3VyY2UgPSBhLCB0aGlzLmxhc3QgPSB0aGlzLnNpbmNlTGFzdFVwZGF0ZSA9IDAsIHRoaXMucmF0ZSA9IEMuaW5pdGlhbFJhdGUsIHRoaXMuY2F0Y2h1cCA9IDAsIHRoaXMucHJvZ3Jlc3MgPSB0aGlzLmxhc3RQcm9ncmVzcyA9IDAsIG51bGwgIT0gdGhpcy5zb3VyY2UgJiYgKHRoaXMucHJvZ3Jlc3MgPSBFKHRoaXMuc291cmNlLCBcInByb2dyZXNzXCIpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGEucHJvdG90eXBlLnRpY2sgPSBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICAgICAgdmFyIGM7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGwgPT0gYiAmJiAoYiA9IEUodGhpcy5zb3VyY2UsIFwicHJvZ3Jlc3NcIikpLCBiID49IDEwMCAmJiAodGhpcy5kb25lID0gITApLCBiID09PSB0aGlzLmxhc3QgPyB0aGlzLnNpbmNlTGFzdFVwZGF0ZSArPSBhIDogKHRoaXMuc2luY2VMYXN0VXBkYXRlICYmICh0aGlzLnJhdGUgPSAoYiAtIHRoaXMubGFzdCkgLyB0aGlzLnNpbmNlTGFzdFVwZGF0ZSksIHRoaXMuY2F0Y2h1cCA9IChiIC0gdGhpcy5wcm9ncmVzcykgLyBDLmNhdGNodXBUaW1lLCB0aGlzLnNpbmNlTGFzdFVwZGF0ZSA9IDAsIHRoaXMubGFzdCA9IGIpLCBiID4gdGhpcy5wcm9ncmVzcyAmJiAodGhpcy5wcm9ncmVzcyArPSB0aGlzLmNhdGNodXAgKiBhKSwgYyA9IDEgLSBNYXRoLnBvdyh0aGlzLnByb2dyZXNzIC8gMTAwLCBDLmVhc2VGYWN0b3IpLCB0aGlzLnByb2dyZXNzICs9IGMgKiB0aGlzLnJhdGUgKiBhLCB0aGlzLnByb2dyZXNzID0gTWF0aC5taW4odGhpcy5sYXN0UHJvZ3Jlc3MgKyBDLm1heFByb2dyZXNzUGVyRnJhbWUsIHRoaXMucHJvZ3Jlc3MpLCB0aGlzLnByb2dyZXNzID0gTWF0aC5tYXgoMCwgdGhpcy5wcm9ncmVzcyksIHRoaXMucHJvZ3Jlc3MgPSBNYXRoLm1pbigxMDAsIHRoaXMucHJvZ3Jlc3MpLCB0aGlzLmxhc3RQcm9ncmVzcyA9IHRoaXMucHJvZ3Jlc3MsIHRoaXMucHJvZ3Jlc3NcbiAgICAgICAgICAgIH0sIGFcbiAgICAgICAgfSgpLCBKID0gbnVsbCwgRyA9IG51bGwsIHEgPSBudWxsLCBLID0gbnVsbCwgbyA9IG51bGwsIHIgPSBudWxsLCBQYWNlLnJ1bm5pbmcgPSAhMSwgeSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIEMucmVzdGFydE9uUHVzaFN0YXRlID8gUGFjZS5yZXN0YXJ0KCkgOiB2b2lkIDBcbiAgICAgICAgfSwgbnVsbCAhPSB3aW5kb3cuaGlzdG9yeS5wdXNoU3RhdGUgJiYgKFIgPSB3aW5kb3cuaGlzdG9yeS5wdXNoU3RhdGUsIHdpbmRvdy5oaXN0b3J5LnB1c2hTdGF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHkoKSwgUi5hcHBseSh3aW5kb3cuaGlzdG9yeSwgYXJndW1lbnRzKVxuICAgICAgICB9KSwgbnVsbCAhPSB3aW5kb3cuaGlzdG9yeS5yZXBsYWNlU3RhdGUgJiYgKFUgPSB3aW5kb3cuaGlzdG9yeS5yZXBsYWNlU3RhdGUsIHdpbmRvdy5oaXN0b3J5LnJlcGxhY2VTdGF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHkoKSwgVS5hcHBseSh3aW5kb3cuaGlzdG9yeSwgYXJndW1lbnRzKVxuICAgICAgICB9KSwgayA9IHthamF4OiBhLCBlbGVtZW50czogZCwgZG9jdW1lbnQ6IGMsIGV2ZW50TGFnOiBmfSwgKEEgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciBhLCBjLCBkLCBlLCBmLCBnLCBoLCBpO1xuICAgICAgICAgICAgZm9yIChQYWNlLnNvdXJjZXMgPSBKID0gW10sIGcgPSBbXCJhamF4XCIsIFwiZWxlbWVudHNcIiwgXCJkb2N1bWVudFwiLCBcImV2ZW50TGFnXCJdLCBjID0gMCwgZSA9IGcubGVuZ3RoOyBlID4gYzsgYysrKVxuICAgICAgICAgICAgICAgIGEgPSBnW2NdLCBDW2FdICE9PSAhMSAmJiBKLnB1c2gobmV3IGtbYV0oQ1thXSkpO1xuICAgICAgICAgICAgZm9yIChpID0gbnVsbCAhPSAoaCA9IEMuZXh0cmFTb3VyY2VzKT9oOltdLCBkID0gMCwgZiA9IGkubGVuZ3RoOyBmID4gZDsgZCsrKVxuICAgICAgICAgICAgICAgIEkgPSBpW2RdLCBKLnB1c2gobmV3IEkoQykpO1xuICAgICAgICAgICAgcmV0dXJuIFBhY2UuYmFyID0gcSA9IG5ldyBiLCBHID0gW10sIEsgPSBuZXcgbFxuICAgICAgICB9KSgpLCBQYWNlLnN0b3AgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiBQYWNlLnRyaWdnZXIoXCJzdG9wXCIpLCBQYWNlLnJ1bm5pbmcgPSAhMSwgcS5kZXN0cm95KCksIHIgPSAhMCwgbnVsbCAhPSBvICYmIChcImZ1bmN0aW9uXCIgPT0gdHlwZW9mIHMgJiYgcyhvKSwgbyA9IG51bGwpLCBBKClcbiAgICAgICAgfSwgUGFjZS5yZXN0YXJ0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gUGFjZS50cmlnZ2VyKFwicmVzdGFydFwiKSwgUGFjZS5zdG9wKCksIFBhY2Uuc3RhcnQoKVxuICAgICAgICB9LCBQYWNlLmdvID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gUGFjZS5ydW5uaW5nID0gITAsIHEucmVuZGVyKCksIHIgPSAhMSwgbyA9IEYoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgICAgIHZhciBjLCBkLCBlLCBmLCBnLCBoLCBpLCBqLCBrLCBtLCBuLCBvLCBwLCBzLCB0LCB1LCB2O1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IDEwMCAtIHEucHJvZ3Jlc3MsIGQgPSBvID0gMCwgZSA9ICEwLCBoID0gcCA9IDAsIHQgPSBKLmxlbmd0aDsgdCA+IHA7IGggPSArK3ApXG4gICAgICAgICAgICAgICAgICAgIGZvciAoSSA9IEpbaF0sIG0gPSBudWxsICE9IEdbaF0/R1toXTpHW2hdID0gW10sIGcgPSBudWxsICE9ICh2ID0gSS5lbGVtZW50cyk/djpbSV0sIGkgPSBzID0gMCwgdSA9IGcubGVuZ3RoOyB1ID4gczsgaSA9ICsrcylcbiAgICAgICAgICAgICAgICAgICAgICAgIGYgPSBnW2ldLCBrID0gbnVsbCAhPSBtW2ldID8gbVtpXSA6IG1baV0gPSBuZXcgbChmKSwgZSAmPSBrLmRvbmUsIGsuZG9uZSB8fCAoZCsrLCBvICs9IGsudGljayhhKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGMgPSBvIC8gZCwgcS51cGRhdGUoSy50aWNrKGEsIGMpKSwgbiA9IEIoKSwgcS5kb25lKCkgfHwgZSB8fCByID8gKHEudXBkYXRlKDEwMCksIFBhY2UudHJpZ2dlcihcImRvbmVcIiksIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBxLmZpbmlzaCgpLCBQYWNlLnJ1bm5pbmcgPSAhMSwgUGFjZS50cmlnZ2VyKFwiaGlkZVwiKVxuICAgICAgICAgICAgICAgIH0sIE1hdGgubWF4KEMuZ2hvc3RUaW1lLCBNYXRoLm1pbihDLm1pblRpbWUsIEIoKSAtIG4pKSkpIDogYigpXG4gICAgICAgICAgICB9KVxuICAgICAgICB9LCBQYWNlLnN0YXJ0ID0gZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgdShDLCBhKSwgUGFjZS5ydW5uaW5nID0gITA7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHEucmVuZGVyKClcbiAgICAgICAgICAgIH0gY2F0Y2ggKGIpIHtcbiAgICAgICAgICAgICAgICBpID0gYlxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIucGFjZVwiKSA/IChQYWNlLnRyaWdnZXIoXCJzdGFydFwiKSwgUGFjZS5nbygpKSA6IHNldFRpbWVvdXQoUGFjZS5zdGFydCwgNTApXG4gICAgICAgIH0sIFwiZnVuY3Rpb25cIiA9PSB0eXBlb2YgZGVmaW5lICYmIGRlZmluZS5hbWQgPyBkZWZpbmUoJ3RoZW1lLWFwcCcsIFtdLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiBQYWNlXG4gICAgICAgIH0pIDogXCJvYmplY3RcIiA9PSB0eXBlb2YgZXhwb3J0cyA/IG1vZHVsZS5leHBvcnRzID0gUGFjZSA6IEMuc3RhcnRPblBhZ2VMb2FkICYmIFBhY2Uuc3RhcnQoKVxuICAgIH0pLmNhbGwodGhpcyk7XG59KTtcblxuLyogXG4gKiBCT1ggUkVGUkVTSCBCVVRUT04gXG4gKiAtLS0tLS0tLS0tLS0tLS0tLS1cbiAqIFRoaXMgaXMgYSBjdXN0b20gcGx1Z2luIHRvIHVzZSB3aXRoIHRoZSBjb21wZW5ldCBCT1guIEl0IGFsbG93cyB5b3UgdG8gYWRkXG4gKiBhIHJlZnJlc2ggYnV0dG9uIHRvIHRoZSBib3guIEl0IGNvbnZlcnRzIHRoZSBib3gncyBzdGF0ZSB0byBhIGxvYWRpbmcgc3RhdGUuXG4gKiBcbiAqIFVTQUdFOlxuICogICQoXCIjYm94LXdpZGdldFwiKS5ib3hSZWZyZXNoKCBvcHRpb25zICk7XG4gKiAqL1xuKGZ1bmN0aW9uKCQpIHtcbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgICQuZm4uYm94UmVmcmVzaCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcblxuICAgICAgICAvLyBSZW5kZXIgb3B0aW9uc1xuICAgICAgICB2YXIgc2V0dGluZ3MgPSAkLmV4dGVuZCh7XG4gICAgICAgICAgICAvL1JlZnJlc3NoIGJ1dHRvbiBzZWxlY3RvclxuICAgICAgICAgICAgdHJpZ2dlcjogXCIucmVmcmVzaC1idG5cIixcbiAgICAgICAgICAgIC8vRmlsZSBzb3VyY2UgdG8gYmUgbG9hZGVkIChlLmc6IGFqYXgvc3JjLnBocClcbiAgICAgICAgICAgIHNvdXJjZTogXCJcIixcbiAgICAgICAgICAgIC8vQ2FsbGJhY2tzXG4gICAgICAgICAgICBvbkxvYWRTdGFydDogZnVuY3Rpb24oYm94KSB7XG4gICAgICAgICAgICB9LCAvL1JpZ2h0IGFmdGVyIHRoZSBidXR0b24gaGFzIGJlZW4gY2xpY2tlZFxuICAgICAgICAgICAgb25Mb2FkRG9uZTogZnVuY3Rpb24oYm94KSB7XG4gICAgICAgICAgICB9IC8vV2hlbiB0aGUgc291cmNlIGhhcyBiZWVuIGxvYWRlZFxuXG4gICAgICAgIH0sIG9wdGlvbnMpO1xuXG4gICAgICAgIC8vVGhlIG92ZXJsYXlcbiAgICAgICAgdmFyIG92ZXJsYXkgPSAkKCc8ZGl2IGNsYXNzPVwib3ZlcmxheVwiPjwvZGl2PjxkaXYgY2xhc3M9XCJsb2FkaW5nLWltZ1wiPjwvZGl2PicpO1xuXG4gICAgICAgIHJldHVybiB0aGlzLmVhY2goZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAvL2lmIGEgc291cmNlIGlzIHNwZWNpZmllZFxuICAgICAgICAgICAgaWYgKHNldHRpbmdzLnNvdXJjZSA9PT0gXCJcIikge1xuICAgICAgICAgICAgICAgIGlmIChjb25zb2xlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiUGxlYXNlIHNwZWNpZnkgYSBzb3VyY2UgZmlyc3QgLSBib3hSZWZyZXNoKClcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vdGhlIGJveFxuICAgICAgICAgICAgdmFyIGJveCA9ICQodGhpcyk7XG4gICAgICAgICAgICAvL3RoZSBidXR0b25cbiAgICAgICAgICAgIHZhciByQnRuID0gYm94LmZpbmQoc2V0dGluZ3MudHJpZ2dlcikuZmlyc3QoKTtcblxuICAgICAgICAgICAgLy9PbiB0cmlnZ2VyIGNsaWNrXG4gICAgICAgICAgICByQnRuLmNsaWNrKGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgLy9BZGQgbG9hZGluZyBvdmVybGF5XG4gICAgICAgICAgICAgICAgc3RhcnQoYm94KTtcblxuICAgICAgICAgICAgICAgIC8vUGVyZm9ybSBhamF4IGNhbGxcbiAgICAgICAgICAgICAgICBib3guZmluZChcIi5ib3gtYm9keVwiKS5sb2FkKHNldHRpbmdzLnNvdXJjZSwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIGRvbmUoYm94KTtcbiAgICAgICAgICAgICAgICB9KTtcblxuXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICB9KTtcblxuICAgICAgICBmdW5jdGlvbiBzdGFydChib3gpIHtcbiAgICAgICAgICAgIC8vQWRkIG92ZXJsYXkgYW5kIGxvYWRpbmcgaW1nXG4gICAgICAgICAgICBib3guYXBwZW5kKG92ZXJsYXkpO1xuXG4gICAgICAgICAgICBzZXR0aW5ncy5vbkxvYWRTdGFydC5jYWxsKGJveCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBkb25lKGJveCkge1xuICAgICAgICAgICAgLy9SZW1vdmUgb3ZlcmxheSBhbmQgbG9hZGluZyBpbWdcbiAgICAgICAgICAgIGJveC5maW5kKG92ZXJsYXkpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgICBzZXR0aW5ncy5vbkxvYWREb25lLmNhbGwoYm94KTtcbiAgICAgICAgfVxuXG4gICAgfTtcblxufSkoalF1ZXJ5KTtcblxuLypcbiAqIFNJREVCQVIgTUVOVVxuICogLS0tLS0tLS0tLS0tXG4gKiBUaGlzIGlzIGEgY3VzdG9tIHBsdWdpbiBmb3IgdGhlIHNpZGViYXIgbWVudS4gSXQgcHJvdmlkZXMgYSB0cmVlIHZpZXcuXG4gKiBcbiAqIFVzYWdlOlxuICogJChcIi5zaWRlYmFyKS50cmVlKCk7XG4gKiBcbiAqIE5vdGU6IFRoaXMgcGx1Z2luIGRvZXMgbm90IGFjY2VwdCBhbnkgb3B0aW9ucy4gSW5zdGVhZCwgaXQgb25seSByZXF1aXJlcyBhIGNsYXNzXG4gKiAgICAgICBhZGRlZCB0byB0aGUgZWxlbWVudCB0aGF0IGNvbnRhaW5zIGEgc3ViLW1lbnUuXG4gKiAgICAgICBcbiAqIFdoZW4gdXNlZCB3aXRoIHRoZSBzaWRlYmFyLCBmb3IgZXhhbXBsZSwgaXQgd291bGQgbG9vayBzb21ldGhpbmcgbGlrZSB0aGlzOlxuICogPHVsIGNsYXNzPSdzaWRlYmFyLW1lbnUnPlxuICogICAgICA8bGkgY2xhc3M9XCJ0cmVldmlldyBhY3RpdmVcIj5cbiAqICAgICAgICAgIDxhIGhyZWY9XCIjPk1lbnU8L2E+XG4gKiAgICAgICAgICA8dWwgY2xhc3M9J3RyZWV2aWV3LW1lbnUnPlxuICogICAgICAgICAgICAgIDxsaSBjbGFzcz0nYWN0aXZlJz48YSBocmVmPSM+TGV2ZWwgMTwvYT48L2xpPlxuICogICAgICAgICAgPC91bD5cbiAqICAgICAgPC9saT5cbiAqIDwvdWw+XG4gKiBcbiAqIEFkZCAuYWN0aXZlIGNsYXNzIHRvIDxsaT4gZWxlbWVudHMgaWYgeW91IHdhbnQgdGhlIG1lbnUgdG8gYmUgb3BlbiBhdXRvbWF0aWNhbGx5XG4gKiBvbiBwYWdlIGxvYWQuIFNlZSBhYm92ZSBmb3IgYW4gZXhhbXBsZS5cbiAqL1xuKGZ1bmN0aW9uKCQpIHtcbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgICQuZm4udHJlZSA9IGZ1bmN0aW9uKCkge1xuXG4gICAgICAgIHJldHVybiB0aGlzLmVhY2goZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2YXIgYnRuID0gJCh0aGlzKS5jaGlsZHJlbihcImFcIikuZmlyc3QoKTtcbiAgICAgICAgICAgIHZhciBtZW51ID0gJCh0aGlzKS5jaGlsZHJlbihcIi50cmVldmlldy1tZW51XCIpLmZpcnN0KCk7XG4gICAgICAgICAgICB2YXIgaXNBY3RpdmUgPSAkKHRoaXMpLmhhc0NsYXNzKCdhY3RpdmUnKTtcblxuICAgICAgICAgICAgLy9pbml0aWFsaXplIGFscmVhZHkgYWN0aXZlIG1lbnVzXG4gICAgICAgICAgICBpZiAoaXNBY3RpdmUpIHtcbiAgICAgICAgICAgICAgICBtZW51LnNob3coKTtcbiAgICAgICAgICAgICAgICBidG4uY2hpbGRyZW4oXCIuZmEtYW5nbGUtbGVmdFwiKS5maXJzdCgpLnJlbW92ZUNsYXNzKFwiZmEtYW5nbGUtbGVmdFwiKS5hZGRDbGFzcyhcImZhLWFuZ2xlLWRvd25cIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvL1NsaWRlIG9wZW4gb3IgY2xvc2UgdGhlIG1lbnUgb24gbGluayBjbGlja1xuICAgICAgICAgICAgYnRuLmNsaWNrKGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgaWYgKGlzQWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vU2xpZGUgdXAgdG8gY2xvc2UgbWVudVxuICAgICAgICAgICAgICAgICAgICBtZW51LnNsaWRlVXAoKTtcbiAgICAgICAgICAgICAgICAgICAgaXNBY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgYnRuLmNoaWxkcmVuKFwiLmZhLWFuZ2xlLWRvd25cIikuZmlyc3QoKS5yZW1vdmVDbGFzcyhcImZhLWFuZ2xlLWRvd25cIikuYWRkQ2xhc3MoXCJmYS1hbmdsZS1sZWZ0XCIpO1xuICAgICAgICAgICAgICAgICAgICBidG4ucGFyZW50KFwibGlcIikucmVtb3ZlQ2xhc3MoXCJhY3RpdmVcIik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy9TbGlkZSBkb3duIHRvIG9wZW4gbWVudVxuICAgICAgICAgICAgICAgICAgICBtZW51LnNsaWRlRG93bigpO1xuICAgICAgICAgICAgICAgICAgICBpc0FjdGl2ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGJ0bi5jaGlsZHJlbihcIi5mYS1hbmdsZS1sZWZ0XCIpLmZpcnN0KCkucmVtb3ZlQ2xhc3MoXCJmYS1hbmdsZS1sZWZ0XCIpLmFkZENsYXNzKFwiZmEtYW5nbGUtZG93blwiKTtcbiAgICAgICAgICAgICAgICAgICAgYnRuLnBhcmVudChcImxpXCIpLmFkZENsYXNzKFwiYWN0aXZlXCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvKiBBZGQgbWFyZ2lucyB0byBzdWJtZW51IGVsZW1lbnRzIHRvIGdpdmUgaXQgYSB0cmVlIGxvb2sgKi9cbiAgICAgICAgICAgIG1lbnUuZmluZChcImxpID4gYVwiKS5lYWNoKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHZhciBwYWQgPSBwYXJzZUludCgkKHRoaXMpLmNzcyhcIm1hcmdpbi1sZWZ0XCIpKSArIDEwO1xuXG4gICAgICAgICAgICAgICAgJCh0aGlzKS5jc3Moe1wibWFyZ2luLWxlZnRcIjogcGFkICsgXCJweFwifSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICB9KTtcblxuICAgIH07XG5cblxufShqUXVlcnkpKTtcblxuLypcbiAqIFRPRE8gTElTVCBDVVNUT00gUExVR0lOXG4gKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogVGhpcyBwbHVnaW4gZGVwZW5kcyBvbiBpQ2hlY2sgcGx1Z2luIGZvciBjaGVja2JveCBhbmQgcmFkaW8gaW5wdXRzXG4gKi9cbihmdW5jdGlvbigkKSB7XG4gICAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgICAkLmZuLnRvZG9saXN0ID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICAvLyBSZW5kZXIgb3B0aW9uc1xuICAgICAgICB2YXIgc2V0dGluZ3MgPSAkLmV4dGVuZCh7XG4gICAgICAgICAgICAvL1doZW4gdGhlIHVzZXIgY2hlY2tzIHRoZSBpbnB1dFxuICAgICAgICAgICAgb25DaGVjazogZnVuY3Rpb24oZWxlKSB7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgLy9XaGVuIHRoZSB1c2VyIHVuY2hlY2tzIHRoZSBpbnB1dFxuICAgICAgICAgICAgb25VbmNoZWNrOiBmdW5jdGlvbihlbGUpIHtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgb3B0aW9ucyk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuZWFjaChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICQoJ2lucHV0JywgdGhpcykub24oJ2lmQ2hlY2tlZCcsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgICAgICAgICAgdmFyIGVsZSA9ICQodGhpcykucGFyZW50cyhcImxpXCIpLmZpcnN0KCk7XG4gICAgICAgICAgICAgICAgZWxlLnRvZ2dsZUNsYXNzKFwiZG9uZVwiKTtcbiAgICAgICAgICAgICAgICBzZXR0aW5ncy5vbkNoZWNrLmNhbGwoZWxlKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAkKCdpbnB1dCcsIHRoaXMpLm9uKCdpZlVuY2hlY2tlZCcsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgICAgICAgICAgdmFyIGVsZSA9ICQodGhpcykucGFyZW50cyhcImxpXCIpLmZpcnN0KCk7XG4gICAgICAgICAgICAgICAgZWxlLnRvZ2dsZUNsYXNzKFwiZG9uZVwiKTtcbiAgICAgICAgICAgICAgICBzZXR0aW5ncy5vblVuY2hlY2suY2FsbChlbGUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbn0oalF1ZXJ5KSk7XG5cbi8qIENFTlRFUiBFTEVNRU5UUyAqL1xuKGZ1bmN0aW9uKCQpIHtcbiAgICBcInVzZSBzdHJpY3RcIjtcbiAgICBqUXVlcnkuZm4uY2VudGVyID0gZnVuY3Rpb24ocGFyZW50KSB7XG4gICAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgICAgIHBhcmVudCA9IHRoaXMucGFyZW50KCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwYXJlbnQgPSB3aW5kb3c7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jc3Moe1xuICAgICAgICAgICAgXCJwb3NpdGlvblwiOiBcImFic29sdXRlXCIsXG4gICAgICAgICAgICBcInRvcFwiOiAoKCgkKHBhcmVudCkuaGVpZ2h0KCkgLSB0aGlzLm91dGVySGVpZ2h0KCkpIC8gMikgKyAkKHBhcmVudCkuc2Nyb2xsVG9wKCkgKyBcInB4XCIpLFxuICAgICAgICAgICAgXCJsZWZ0XCI6ICgoKCQocGFyZW50KS53aWR0aCgpIC0gdGhpcy5vdXRlcldpZHRoKCkpIC8gMikgKyAkKHBhcmVudCkuc2Nyb2xsTGVmdCgpICsgXCJweFwiKVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxufShqUXVlcnkpKTtcblxuLypcbiAqIGpRdWVyeSByZXNpemUgZXZlbnQgLSB2MS4xIC0gMy8xNC8yMDEwXG4gKiBodHRwOi8vYmVuYWxtYW4uY29tL3Byb2plY3RzL2pxdWVyeS1yZXNpemUtcGx1Z2luL1xuICogXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAgXCJDb3dib3lcIiBCZW4gQWxtYW5cbiAqIER1YWwgbGljZW5zZWQgdW5kZXIgdGhlIE1JVCBhbmQgR1BMIGxpY2Vuc2VzLlxuICogaHR0cDovL2JlbmFsbWFuLmNvbS9hYm91dC9saWNlbnNlL1xuICovXG4oZnVuY3Rpb24oJCwgaCwgYykge1xuICAgIHZhciBhID0gJChbXSksIGUgPSAkLnJlc2l6ZSA9ICQuZXh0ZW5kKCQucmVzaXplLCB7fSksIGksIGsgPSBcInNldFRpbWVvdXRcIiwgaiA9IFwicmVzaXplXCIsIGQgPSBqICsgXCItc3BlY2lhbC1ldmVudFwiLCBiID0gXCJkZWxheVwiLCBmID0gXCJ0aHJvdHRsZVdpbmRvd1wiO1xuICAgIGVbYl0gPSAyNTA7XG4gICAgZVtmXSA9IHRydWU7XG4gICAgJC5ldmVudC5zcGVjaWFsW2pdID0ge3NldHVwOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmICghZVtmXSAmJiB0aGlzW2tdKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGwgPSAkKHRoaXMpO1xuICAgICAgICAgICAgYSA9IGEuYWRkKGwpO1xuICAgICAgICAgICAgJC5kYXRhKHRoaXMsIGQsIHt3OiBsLndpZHRoKCksIGg6IGwuaGVpZ2h0KCl9KTtcbiAgICAgICAgICAgIGlmIChhLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICAgIGcoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdGVhcmRvd246IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKCFlW2ZdICYmIHRoaXNba10pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBsID0gJCh0aGlzKTtcbiAgICAgICAgICAgIGEgPSBhLm5vdChsKTtcbiAgICAgICAgICAgIGwucmVtb3ZlRGF0YShkKTtcbiAgICAgICAgICAgIGlmICghYS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQoaSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIGFkZDogZnVuY3Rpb24obCkge1xuICAgICAgICAgICAgaWYgKCFlW2ZdICYmIHRoaXNba10pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBuO1xuICAgICAgICAgICAgZnVuY3Rpb24gbShzLCBvLCBwKSB7XG4gICAgICAgICAgICAgICAgdmFyIHEgPSAkKHRoaXMpLCByID0gJC5kYXRhKHRoaXMsIGQpO1xuICAgICAgICAgICAgICAgIHIudyA9IG8gIT09IGMgPyBvIDogcS53aWR0aCgpO1xuICAgICAgICAgICAgICAgIHIuaCA9IHAgIT09IGMgPyBwIDogcS5oZWlnaHQoKTtcbiAgICAgICAgICAgICAgICBuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICgkLmlzRnVuY3Rpb24obCkpIHtcbiAgICAgICAgICAgICAgICBuID0gbDtcbiAgICAgICAgICAgICAgICByZXR1cm4gbVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBuID0gbC5oYW5kbGVyO1xuICAgICAgICAgICAgICAgIGwuaGFuZGxlciA9IG1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfX07XG4gICAgZnVuY3Rpb24gZygpIHtcbiAgICAgICAgaWYodHlwZW9mIGhba10gPT0gJ2Z1bmN0aW9uJyl7XG4gICAgICAgIGkgPSBoW2tdKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgYS5lYWNoKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHZhciBuID0gJCh0aGlzKSwgbSA9IG4ud2lkdGgoKSwgbCA9IG4uaGVpZ2h0KCksIG8gPSAkLmRhdGEodGhpcywgZCk7XG4gICAgICAgICAgICAgICAgaWYgKG0gIT09IG8udyB8fCBsICE9PSBvLmgpIHtcbiAgICAgICAgICAgICAgICAgICAgbi50cmlnZ2VyKGosIFtvLncgPSBtLCBvLmggPSBsXSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGcoKVxuICAgICAgICB9LCBlW2JdKVxuICAgICAgICB9XG4gICAgfX1cbikoalF1ZXJ5LCB0aGlzKTtcblxuLyohXG4gKiBTbGltU2Nyb2xsIGh0dHBzOi8vZ2l0aHViLmNvbS9yb2NoYWwvalF1ZXJ5LXNsaW1TY3JvbGxcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIFxuICogQ29weXJpZ2h0IChjKSAyMDExIFBpb3RyIFJvY2hhbGEgKGh0dHA6Ly9yb2NoYS5sYSkgRHVhbCBsaWNlbnNlZCB1bmRlciB0aGUgTUlUIFxuICovXG4oZnVuY3Rpb24oZikge1xuICAgIGpRdWVyeS5mbi5leHRlbmQoe3NsaW1TY3JvbGw6IGZ1bmN0aW9uKGgpIHtcbiAgICAgICAgICAgIHZhciBhID0gZi5leHRlbmQoe3dpZHRoOiBcImF1dG9cIiwgaGVpZ2h0OiBcIjI1MHB4XCIsIHNpemU6IFwiN3B4XCIsIGNvbG9yOiBcIiMwMDBcIiwgcG9zaXRpb246IFwicmlnaHRcIiwgZGlzdGFuY2U6IFwiMXB4XCIsIHN0YXJ0OiBcInRvcFwiLCBvcGFjaXR5OiAwLjQsIGFsd2F5c1Zpc2libGU6ICExLCBkaXNhYmxlRmFkZU91dDogITEsIHJhaWxWaXNpYmxlOiAhMSwgcmFpbENvbG9yOiBcIiMzMzNcIiwgcmFpbE9wYWNpdHk6IDAuMiwgcmFpbERyYWdnYWJsZTogITAsIHJhaWxDbGFzczogXCJzbGltU2Nyb2xsUmFpbFwiLCBiYXJDbGFzczogXCJzbGltU2Nyb2xsQmFyXCIsIHdyYXBwZXJDbGFzczogXCJzbGltU2Nyb2xsRGl2XCIsIGFsbG93UGFnZVNjcm9sbDogITEsIHdoZWVsU3RlcDogMjAsIHRvdWNoU2Nyb2xsU3RlcDogMjAwLCBib3JkZXJSYWRpdXM6IFwiMHB4XCIsIHJhaWxCb3JkZXJSYWRpdXM6IFwiMHB4XCJ9LCBoKTtcbiAgICAgICAgICAgIHRoaXMuZWFjaChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiByKGQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGQgPSBkIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpbmRvdy5ldmVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBjID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGQud2hlZWxEZWx0YSAmJiAoYyA9IC1kLndoZWVsRGVsdGEgLyAxMjApO1xuICAgICAgICAgICAgICAgICAgICAgICAgZC5kZXRhaWwgJiYgKGMgPSBkLmRldGFpbCAvIDMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZihkLnRhcmdldCB8fCBkLnNyY1RhcmdldCB8fCBkLnNyY0VsZW1lbnQpLmNsb3Nlc3QoXCIuXCIgKyBhLndyYXBwZXJDbGFzcykuaXMoYi5wYXJlbnQoKSkgJiYgbShjLCAhMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBkLnByZXZlbnREZWZhdWx0ICYmICFrICYmIGQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGsgfHwgKGQucmV0dXJuVmFsdWUgPSAhMSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBtKGQsIGYsIGgpIHtcbiAgICAgICAgICAgICAgICAgICAgayA9ICExO1xuICAgICAgICAgICAgICAgICAgICB2YXIgZSA9IGQsIGcgPSBiLm91dGVySGVpZ2h0KCkgLSBjLm91dGVySGVpZ2h0KCk7XG4gICAgICAgICAgICAgICAgICAgIGYgJiYgKGUgPSBwYXJzZUludChjLmNzcyhcInRvcFwiKSkgKyBkICogcGFyc2VJbnQoYS53aGVlbFN0ZXApIC8gMTAwICogYy5vdXRlckhlaWdodCgpLCBlID0gTWF0aC5taW4oTWF0aC5tYXgoZSwgMCksIGcpLCBlID0gMCA8IGQgPyBNYXRoLmNlaWwoZSkgOiBNYXRoLmZsb29yKGUpLCBjLmNzcyh7dG9wOiBlICsgXCJweFwifSkpO1xuICAgICAgICAgICAgICAgICAgICBsID0gcGFyc2VJbnQoYy5jc3MoXCJ0b3BcIikpIC8gKGIub3V0ZXJIZWlnaHQoKSAtIGMub3V0ZXJIZWlnaHQoKSk7XG4gICAgICAgICAgICAgICAgICAgIGUgPSBsICogKGJbMF0uc2Nyb2xsSGVpZ2h0IC0gYi5vdXRlckhlaWdodCgpKTtcbiAgICAgICAgICAgICAgICAgICAgaCAmJiAoZSA9IGQsIGQgPSBlIC8gYlswXS5zY3JvbGxIZWlnaHQgKiBiLm91dGVySGVpZ2h0KCksIGQgPSBNYXRoLm1pbihNYXRoLm1heChkLCAwKSwgZyksIGMuY3NzKHt0b3A6IGQgKyBcInB4XCJ9KSk7XG4gICAgICAgICAgICAgICAgICAgIGIuc2Nyb2xsVG9wKGUpO1xuICAgICAgICAgICAgICAgICAgICBiLnRyaWdnZXIoXCJzbGltc2Nyb2xsaW5nXCIsIH5+ZSk7XG4gICAgICAgICAgICAgICAgICAgIHYoKTtcbiAgICAgICAgICAgICAgICAgICAgcCgpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIEMoKSB7XG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyID8gKHRoaXMuYWRkRXZlbnRMaXN0ZW5lcihcIkRPTU1vdXNlU2Nyb2xsXCIsIHIsICExKSwgdGhpcy5hZGRFdmVudExpc3RlbmVyKFwibW91c2V3aGVlbFwiLCByLCAhMSksIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcihcIk1vek1vdXNlUGl4ZWxTY3JvbGxcIiwgciwgITEpKSA6IGRvY3VtZW50LmF0dGFjaEV2ZW50KFwib25tb3VzZXdoZWVsXCIsIHIpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIHcoKSB7XG4gICAgICAgICAgICAgICAgICAgIHUgPSBNYXRoLm1heChiLm91dGVySGVpZ2h0KCkgLyBiWzBdLnNjcm9sbEhlaWdodCAqIGIub3V0ZXJIZWlnaHQoKSwgRCk7XG4gICAgICAgICAgICAgICAgICAgIGMuY3NzKHtoZWlnaHQ6IHUgKyBcInB4XCJ9KTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGEgPSB1ID09IGIub3V0ZXJIZWlnaHQoKSA/IFwibm9uZVwiIDogXCJibG9ja1wiO1xuICAgICAgICAgICAgICAgICAgICBjLmNzcyh7ZGlzcGxheTogYX0pXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIHYoKSB7XG4gICAgICAgICAgICAgICAgICAgIHcoKTtcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KEEpO1xuICAgICAgICAgICAgICAgICAgICBsID09IH5+bCA/IChrID0gYS5hbGxvd1BhZ2VTY3JvbGwsIEIgIT0gbCAmJiBiLnRyaWdnZXIoXCJzbGltc2Nyb2xsXCIsIDAgPT0gfn5sID8gXCJ0b3BcIiA6IFwiYm90dG9tXCIpKSA6IGsgPSAhMTtcbiAgICAgICAgICAgICAgICAgICAgQiA9IGw7XG4gICAgICAgICAgICAgICAgICAgIHUgPj0gYi5vdXRlckhlaWdodCgpID8gayA9ICEwIDogKGMuc3RvcCghMCwgITApLmZhZGVJbihcImZhc3RcIiksIGEucmFpbFZpc2libGUgJiYgZy5zdG9wKCEwLCAhMCkuZmFkZUluKFwiZmFzdFwiKSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gcCgpIHtcbiAgICAgICAgICAgICAgICAgICAgYS5hbHdheXNWaXNpYmxlIHx8IChBID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGEuZGlzYWJsZUZhZGVPdXQgJiYgcyB8fCAoeCB8fCB5KSB8fCAoYy5mYWRlT3V0KFwic2xvd1wiKSwgZy5mYWRlT3V0KFwic2xvd1wiKSlcbiAgICAgICAgICAgICAgICAgICAgfSwgMUUzKSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFyIHMsIHgsIHksIEEsIHosIHUsIGwsIEIsIEQgPSAzMCwgayA9ICExLCBiID0gZih0aGlzKTtcbiAgICAgICAgICAgICAgICBpZiAoYi5wYXJlbnQoKS5oYXNDbGFzcyhhLndyYXBwZXJDbGFzcykpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG4gPSBiLnNjcm9sbFRvcCgpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGMgPSBiLnBhcmVudCgpLmZpbmQoXCIuXCIgKyBhLmJhckNsYXNzKSwgZyA9IGIucGFyZW50KCkuZmluZChcIi5cIiArIGEucmFpbENsYXNzKTtcbiAgICAgICAgICAgICAgICAgICAgdygpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZi5pc1BsYWluT2JqZWN0KGgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoXCJoZWlnaHRcImluIGggJiYgXCJhdXRvXCIgPT0gaC5oZWlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiLnBhcmVudCgpLmNzcyhcImhlaWdodFwiLCBcImF1dG9cIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYi5jc3MoXCJoZWlnaHRcIiwgXCJhdXRvXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBxID0gYi5wYXJlbnQoKS5wYXJlbnQoKS5oZWlnaHQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiLnBhcmVudCgpLmNzcyhcImhlaWdodFwiLCBxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiLmNzcyhcImhlaWdodFwiLCBxKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKFwic2Nyb2xsVG9cImluIGgpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbiA9IHBhcnNlSW50KGEuc2Nyb2xsVG8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoXCJzY3JvbGxCeVwiaW4gaClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuICs9IHBhcnNlSW50KGEuc2Nyb2xsQnkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoXCJkZXN0cm95XCJpbiBoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYy5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBnLnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGIudW53cmFwKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBtKG4sICExLCAhMClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGEuaGVpZ2h0ID0gXCJhdXRvXCIgPT0gYS5oZWlnaHQgPyBiLnBhcmVudCgpLmhlaWdodCgpIDogYS5oZWlnaHQ7XG4gICAgICAgICAgICAgICAgICAgIG4gPSBmKFwiPGRpdj48L2Rpdj5cIikuYWRkQ2xhc3MoYS53cmFwcGVyQ2xhc3MpLmNzcyh7cG9zaXRpb246IFwicmVsYXRpdmVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIG92ZXJmbG93OiBcImhpZGRlblwiLCB3aWR0aDogYS53aWR0aCwgaGVpZ2h0OiBhLmhlaWdodH0pO1xuICAgICAgICAgICAgICAgICAgICBiLmNzcyh7b3ZlcmZsb3c6IFwiaGlkZGVuXCIsIHdpZHRoOiBhLndpZHRoLCBoZWlnaHQ6IGEuaGVpZ2h0fSk7XG4gICAgICAgICAgICAgICAgICAgIHZhciBnID0gZihcIjxkaXY+PC9kaXY+XCIpLmFkZENsYXNzKGEucmFpbENsYXNzKS5jc3Moe3dpZHRoOiBhLnNpemUsIGhlaWdodDogXCIxMDAlXCIsIHBvc2l0aW9uOiBcImFic29sdXRlXCIsIHRvcDogMCwgZGlzcGxheTogYS5hbHdheXNWaXNpYmxlICYmIGEucmFpbFZpc2libGUgPyBcImJsb2NrXCIgOiBcIm5vbmVcIiwgXCJib3JkZXItcmFkaXVzXCI6IGEucmFpbEJvcmRlclJhZGl1cywgYmFja2dyb3VuZDogYS5yYWlsQ29sb3IsIG9wYWNpdHk6IGEucmFpbE9wYWNpdHksIHpJbmRleDogOTB9KSwgYyA9IGYoXCI8ZGl2PjwvZGl2PlwiKS5hZGRDbGFzcyhhLmJhckNsYXNzKS5jc3Moe2JhY2tncm91bmQ6IGEuY29sb3IsIHdpZHRoOiBhLnNpemUsIHBvc2l0aW9uOiBcImFic29sdXRlXCIsIHRvcDogMCwgb3BhY2l0eTogYS5vcGFjaXR5LCBkaXNwbGF5OiBhLmFsd2F5c1Zpc2libGUgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImJsb2NrXCIgOiBcIm5vbmVcIiwgXCJib3JkZXItcmFkaXVzXCI6IGEuYm9yZGVyUmFkaXVzLCBCb3JkZXJSYWRpdXM6IGEuYm9yZGVyUmFkaXVzLCBNb3pCb3JkZXJSYWRpdXM6IGEuYm9yZGVyUmFkaXVzLCBXZWJraXRCb3JkZXJSYWRpdXM6IGEuYm9yZGVyUmFkaXVzLCB6SW5kZXg6IDk5fSksIHEgPSBcInJpZ2h0XCIgPT0gYS5wb3NpdGlvbiA/IHtyaWdodDogYS5kaXN0YW5jZX0gOiB7bGVmdDogYS5kaXN0YW5jZX07XG4gICAgICAgICAgICAgICAgICAgIGcuY3NzKHEpO1xuICAgICAgICAgICAgICAgICAgICBjLmNzcyhxKTtcbiAgICAgICAgICAgICAgICAgICAgYi53cmFwKG4pO1xuICAgICAgICAgICAgICAgICAgICBiLnBhcmVudCgpLmFwcGVuZChjKTtcbiAgICAgICAgICAgICAgICAgICAgYi5wYXJlbnQoKS5hcHBlbmQoZyk7XG4gICAgICAgICAgICAgICAgICAgIGEucmFpbERyYWdnYWJsZSAmJiBjLmJpbmQoXCJtb3VzZWRvd25cIiwgZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGIgPSBmKGRvY3VtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHkgPSAhMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHQgPSBwYXJzZUZsb2F0KGMuY3NzKFwidG9wXCIpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhZ2VZID0gYS5wYWdlWTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGIuYmluZChcIm1vdXNlbW92ZS5zbGltc2Nyb2xsXCIsIGZ1bmN0aW9uKGEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJyVG9wID0gdCArIGEucGFnZVkgLSBwYWdlWTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjLmNzcyhcInRvcFwiLCBjdXJyVG9wKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtKDAsIGMucG9zaXRpb24oKS50b3AsICExKVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBiLmJpbmQoXCJtb3VzZXVwLnNsaW1zY3JvbGxcIiwgZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHkgPSAhMTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYi51bmJpbmQoXCIuc2xpbXNjcm9sbFwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4hMVxuICAgICAgICAgICAgICAgICAgICB9KS5iaW5kKFwic2VsZWN0c3RhcnQuc2xpbXNjcm9sbFwiLCBmdW5jdGlvbihhKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuITFcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIGcuaG92ZXIoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2KClcbiAgICAgICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwKClcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIGMuaG92ZXIoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4ID0gITBcbiAgICAgICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4ID0gITFcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIGIuaG92ZXIoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzID0gITA7XG4gICAgICAgICAgICAgICAgICAgICAgICB2KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBwKClcbiAgICAgICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzID0gITE7XG4gICAgICAgICAgICAgICAgICAgICAgICBwKClcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIGIuYmluZChcInRvdWNoc3RhcnRcIiwgZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgICAgICAgICAgICAgYS5vcmlnaW5hbEV2ZW50LnRvdWNoZXMubGVuZ3RoICYmICh6ID0gYS5vcmlnaW5hbEV2ZW50LnRvdWNoZXNbMF0ucGFnZVkpXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBiLmJpbmQoXCJ0b3VjaG1vdmVcIiwgZnVuY3Rpb24oYikge1xuICAgICAgICAgICAgICAgICAgICAgICAgayB8fCBiLm9yaWdpbmFsRXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGIub3JpZ2luYWxFdmVudC50b3VjaGVzLmxlbmd0aCAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAobSgoeiAtIGIub3JpZ2luYWxFdmVudC50b3VjaGVzWzBdLnBhZ2VZKSAvIGEudG91Y2hTY3JvbGxTdGVwLCAhMCksIHogPSBiLm9yaWdpbmFsRXZlbnQudG91Y2hlc1swXS5wYWdlWSlcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHcoKTtcbiAgICAgICAgICAgICAgICAgICAgXCJib3R0b21cIiA9PT0gYS5zdGFydCA/IChjLmNzcyh7dG9wOiBiLm91dGVySGVpZ2h0KCkgLSBjLm91dGVySGVpZ2h0KCl9KSwgbSgwLCAhMCkpIDogXCJ0b3BcIiAhPT0gYS5zdGFydCAmJiAobShmKGEuc3RhcnQpLnBvc2l0aW9uKCkudG9wLCBudWxsLCAhMCksIGEuYWx3YXlzVmlzaWJsZSB8fCBjLmhpZGUoKSk7XG4gICAgICAgICAgICAgICAgICAgIEMoKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgICAgfX0pO1xuICAgIGpRdWVyeS5mbi5leHRlbmQoe3NsaW1zY3JvbGw6IGpRdWVyeS5mbi5zbGltU2Nyb2xsfSlcbn0pKGpRdWVyeSk7XG5cbi8qISBpQ2hlY2sgdjEuMC4xIGJ5IERhbWlyIFN1bHRhbm92LCBodHRwOi8vZ2l0LmlvL2FybHplQSwgTUlUIExpY2Vuc2VkICovXG4oZnVuY3Rpb24oaCkge1xuICAgIGZ1bmN0aW9uIEYoYSwgYiwgZCkge1xuICAgICAgICB2YXIgYyA9IGFbMF0sIGUgPSAvZXIvLnRlc3QoZCkgPyBtIDogL2JsLy50ZXN0KGQpID8gcyA6IGwsIGYgPSBkID09IEggPyB7Y2hlY2tlZDogY1tsXSwgZGlzYWJsZWQ6IGNbc10sIGluZGV0ZXJtaW5hdGU6IFwidHJ1ZVwiID09IGEuYXR0cihtKSB8fCBcImZhbHNlXCIgPT0gYS5hdHRyKHcpfSA6IGNbZV07XG4gICAgICAgIGlmICgvXihjaHxkaXxpbikvLnRlc3QoZCkgJiYgIWYpXG4gICAgICAgICAgICBEKGEsIGUpO1xuICAgICAgICBlbHNlIGlmICgvXih1bnxlbnxkZSkvLnRlc3QoZCkgJiYgZilcbiAgICAgICAgICAgIHQoYSwgZSk7XG4gICAgICAgIGVsc2UgaWYgKGQgPT0gSClcbiAgICAgICAgICAgIGZvciAoZSBpbiBmKVxuICAgICAgICAgICAgICAgIGZbZV0gPyBEKGEsIGUsICEwKSA6IHQoYSwgZSwgITApO1xuICAgICAgICBlbHNlIGlmICghYiB8fCBcInRvZ2dsZVwiID09IGQpIHtcbiAgICAgICAgICAgIGlmICghYilcbiAgICAgICAgICAgICAgICBhW3BdKFwiaWZDbGlja2VkXCIpO1xuICAgICAgICAgICAgZiA/IGNbbl0gIT09IHUgJiYgdChhLCBlKSA6IEQoYSwgZSlcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBEKGEsIGIsIGQpIHtcbiAgICAgICAgdmFyIGMgPSBhWzBdLCBlID0gYS5wYXJlbnQoKSwgZiA9IGIgPT0gbCwgQSA9IGIgPT0gbSwgQiA9IGIgPT0gcywgSyA9IEEgPyB3IDogZiA/IEUgOiBcImVuYWJsZWRcIiwgcCA9IGsoYSwgSyArIHgoY1tuXSkpLCBOID0gayhhLCBiICsgeChjW25dKSk7XG4gICAgICAgIGlmICghMCAhPT0gY1tiXSkge1xuICAgICAgICAgICAgaWYgKCFkICYmXG4gICAgICAgICAgICAgICAgICAgIGIgPT0gbCAmJiBjW25dID09IHUgJiYgYy5uYW1lKSB7XG4gICAgICAgICAgICAgICAgdmFyIEMgPSBhLmNsb3Nlc3QoXCJmb3JtXCIpLCByID0gJ2lucHV0W25hbWU9XCInICsgYy5uYW1lICsgJ1wiXScsIHIgPSBDLmxlbmd0aCA/IEMuZmluZChyKSA6IGgocik7XG4gICAgICAgICAgICAgICAgci5lYWNoKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzICE9PSBjICYmIGgodGhpcykuZGF0YShxKSAmJiB0KGgodGhpcyksIGIpXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIEEgPyAoY1tiXSA9ICEwLCBjW2xdICYmIHQoYSwgbCwgXCJmb3JjZVwiKSkgOiAoZCB8fCAoY1tiXSA9ICEwKSwgZiAmJiBjW21dICYmIHQoYSwgbSwgITEpKTtcbiAgICAgICAgICAgIEwoYSwgZiwgYiwgZClcbiAgICAgICAgfVxuICAgICAgICBjW3NdICYmIGsoYSwgeSwgITApICYmIGUuZmluZChcIi5cIiArIEkpLmNzcyh5LCBcImRlZmF1bHRcIik7XG4gICAgICAgIGVbdl0oTiB8fCBrKGEsIGIpIHx8IFwiXCIpO1xuICAgICAgICBCID8gZS5hdHRyKFwiYXJpYS1kaXNhYmxlZFwiLCBcInRydWVcIikgOiBlLmF0dHIoXCJhcmlhLWNoZWNrZWRcIiwgQSA/IFwibWl4ZWRcIiA6IFwidHJ1ZVwiKTtcbiAgICAgICAgZVt6XShwIHx8IGsoYSwgSykgfHwgXCJcIilcbiAgICB9XG4gICAgZnVuY3Rpb24gdChhLCBiLCBkKSB7XG4gICAgICAgIHZhciBjID0gYVswXSwgZSA9IGEucGFyZW50KCksIGYgPSBiID09IGwsIGggPSBiID09IG0sIHEgPSBiID09IHMsIHAgPSBoID8gdyA6IGYgPyBFIDogXCJlbmFibGVkXCIsIHQgPSBrKGEsIHAgKyB4KGNbbl0pKSxcbiAgICAgICAgICAgICAgICB1ID0gayhhLCBiICsgeChjW25dKSk7XG4gICAgICAgIGlmICghMSAhPT0gY1tiXSkge1xuICAgICAgICAgICAgaWYgKGggfHwgIWQgfHwgXCJmb3JjZVwiID09IGQpXG4gICAgICAgICAgICAgICAgY1tiXSA9ICExO1xuICAgICAgICAgICAgTChhLCBmLCBwLCBkKVxuICAgICAgICB9XG4gICAgICAgICFjW3NdICYmIGsoYSwgeSwgITApICYmIGUuZmluZChcIi5cIiArIEkpLmNzcyh5LCBcInBvaW50ZXJcIik7XG4gICAgICAgIGVbel0odSB8fCBrKGEsIGIpIHx8IFwiXCIpO1xuICAgICAgICBxID8gZS5hdHRyKFwiYXJpYS1kaXNhYmxlZFwiLCBcImZhbHNlXCIpIDogZS5hdHRyKFwiYXJpYS1jaGVja2VkXCIsIFwiZmFsc2VcIik7XG4gICAgICAgIGVbdl0odCB8fCBrKGEsIHApIHx8IFwiXCIpXG4gICAgfVxuICAgIGZ1bmN0aW9uIE0oYSwgYikge1xuICAgICAgICBpZiAoYS5kYXRhKHEpKSB7XG4gICAgICAgICAgICBhLnBhcmVudCgpLmh0bWwoYS5hdHRyKFwic3R5bGVcIiwgYS5kYXRhKHEpLnMgfHwgXCJcIikpO1xuICAgICAgICAgICAgaWYgKGIpXG4gICAgICAgICAgICAgICAgYVtwXShiKTtcbiAgICAgICAgICAgIGEub2ZmKFwiLmlcIikudW53cmFwKCk7XG4gICAgICAgICAgICBoKEcgKyAnW2Zvcj1cIicgKyBhWzBdLmlkICsgJ1wiXScpLmFkZChhLmNsb3Nlc3QoRykpLm9mZihcIi5pXCIpXG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gayhhLCBiLCBkKSB7XG4gICAgICAgIGlmIChhLmRhdGEocSkpXG4gICAgICAgICAgICByZXR1cm4gYS5kYXRhKHEpLm9bYiArIChkID8gXCJcIiA6IFwiQ2xhc3NcIildXG4gICAgfVxuICAgIGZ1bmN0aW9uIHgoYSkge1xuICAgICAgICByZXR1cm4gYS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArXG4gICAgICAgICAgICAgICAgYS5zbGljZSgxKVxuICAgIH1cbiAgICBmdW5jdGlvbiBMKGEsIGIsIGQsIGMpIHtcbiAgICAgICAgaWYgKCFjKSB7XG4gICAgICAgICAgICBpZiAoYilcbiAgICAgICAgICAgICAgICBhW3BdKFwiaWZUb2dnbGVkXCIpO1xuICAgICAgICAgICAgYVtwXShcImlmQ2hhbmdlZFwiKVtwXShcImlmXCIgKyB4KGQpKVxuICAgICAgICB9XG4gICAgfVxuICAgIHZhciBxID0gXCJpQ2hlY2tcIiwgSSA9IHEgKyBcIi1oZWxwZXJcIiwgdSA9IFwicmFkaW9cIiwgbCA9IFwiY2hlY2tlZFwiLCBFID0gXCJ1blwiICsgbCwgcyA9IFwiZGlzYWJsZWRcIiwgdyA9IFwiZGV0ZXJtaW5hdGVcIiwgbSA9IFwiaW5cIiArIHcsIEggPSBcInVwZGF0ZVwiLCBuID0gXCJ0eXBlXCIsIHYgPSBcImFkZENsYXNzXCIsIHogPSBcInJlbW92ZUNsYXNzXCIsIHAgPSBcInRyaWdnZXJcIiwgRyA9IFwibGFiZWxcIiwgeSA9IFwiY3Vyc29yXCIsIEogPSAvaXBhZHxpcGhvbmV8aXBvZHxhbmRyb2lkfGJsYWNrYmVycnl8d2luZG93cyBwaG9uZXxvcGVyYSBtaW5pfHNpbGsvaS50ZXN0KG5hdmlnYXRvci51c2VyQWdlbnQpO1xuICAgIGguZm5bcV0gPSBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgIHZhciBkID0gJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXSwgaW5wdXRbdHlwZT1cIicgKyB1ICsgJ1wiXScsIGMgPSBoKCksIGUgPSBmdW5jdGlvbihhKSB7XG4gICAgICAgICAgICBhLmVhY2goZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdmFyIGEgPSBoKHRoaXMpO1xuICAgICAgICAgICAgICAgIGMgPSBhLmlzKGQpID9cbiAgICAgICAgICAgICAgICAgICAgICAgIGMuYWRkKGEpIDogYy5hZGQoYS5maW5kKGQpKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKC9eKGNoZWNrfHVuY2hlY2t8dG9nZ2xlfGluZGV0ZXJtaW5hdGV8ZGV0ZXJtaW5hdGV8ZGlzYWJsZXxlbmFibGV8dXBkYXRlfGRlc3Ryb3kpJC9pLnRlc3QoYSkpXG4gICAgICAgICAgICByZXR1cm4gYSA9IGEudG9Mb3dlckNhc2UoKSwgZSh0aGlzKSwgYy5lYWNoKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHZhciBjID0gaCh0aGlzKTtcbiAgICAgICAgICAgICAgICBcImRlc3Ryb3lcIiA9PSBhID8gTShjLCBcImlmRGVzdHJveWVkXCIpIDogRihjLCAhMCwgYSk7XG4gICAgICAgICAgICAgICAgaC5pc0Z1bmN0aW9uKGIpICYmIGIoKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIGlmIChcIm9iamVjdFwiICE9IHR5cGVvZiBhICYmIGEpXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgdmFyIGYgPSBoLmV4dGVuZCh7Y2hlY2tlZENsYXNzOiBsLCBkaXNhYmxlZENsYXNzOiBzLCBpbmRldGVybWluYXRlQ2xhc3M6IG0sIGxhYmVsSG92ZXI6ICEwLCBhcmlhOiAhMX0sIGEpLCBrID0gZi5oYW5kbGUsIEIgPSBmLmhvdmVyQ2xhc3MgfHwgXCJob3ZlclwiLCB4ID0gZi5mb2N1c0NsYXNzIHx8IFwiZm9jdXNcIiwgdyA9IGYuYWN0aXZlQ2xhc3MgfHwgXCJhY3RpdmVcIiwgeSA9ICEhZi5sYWJlbEhvdmVyLCBDID0gZi5sYWJlbEhvdmVyQ2xhc3MgfHxcbiAgICAgICAgICAgICAgICBcImhvdmVyXCIsIHIgPSAoXCJcIiArIGYuaW5jcmVhc2VBcmVhKS5yZXBsYWNlKFwiJVwiLCBcIlwiKSB8IDA7XG4gICAgICAgIGlmIChcImNoZWNrYm94XCIgPT0gayB8fCBrID09IHUpXG4gICAgICAgICAgICBkID0gJ2lucHV0W3R5cGU9XCInICsgayArICdcIl0nO1xuICAgICAgICAtNTAgPiByICYmIChyID0gLTUwKTtcbiAgICAgICAgZSh0aGlzKTtcbiAgICAgICAgcmV0dXJuIGMuZWFjaChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciBhID0gaCh0aGlzKTtcbiAgICAgICAgICAgIE0oYSk7XG4gICAgICAgICAgICB2YXIgYyA9IHRoaXMsIGIgPSBjLmlkLCBlID0gLXIgKyBcIiVcIiwgZCA9IDEwMCArIDIgKiByICsgXCIlXCIsIGQgPSB7cG9zaXRpb246IFwiYWJzb2x1dGVcIiwgdG9wOiBlLCBsZWZ0OiBlLCBkaXNwbGF5OiBcImJsb2NrXCIsIHdpZHRoOiBkLCBoZWlnaHQ6IGQsIG1hcmdpbjogMCwgcGFkZGluZzogMCwgYmFja2dyb3VuZDogXCIjZmZmXCIsIGJvcmRlcjogMCwgb3BhY2l0eTogMH0sIGUgPSBKID8ge3Bvc2l0aW9uOiBcImFic29sdXRlXCIsIHZpc2liaWxpdHk6IFwiaGlkZGVuXCJ9IDogciA/IGQgOiB7cG9zaXRpb246IFwiYWJzb2x1dGVcIiwgb3BhY2l0eTogMH0sIGsgPSBcImNoZWNrYm94XCIgPT0gY1tuXSA/IGYuY2hlY2tib3hDbGFzcyB8fCBcImljaGVja2JveFwiIDogZi5yYWRpb0NsYXNzIHx8IFwiaVwiICsgdSwgbSA9IGgoRyArICdbZm9yPVwiJyArIGIgKyAnXCJdJykuYWRkKGEuY2xvc2VzdChHKSksXG4gICAgICAgICAgICAgICAgICAgIEEgPSAhIWYuYXJpYSwgRSA9IHEgKyBcIi1cIiArIE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnJlcGxhY2UoXCIwLlwiLCBcIlwiKSwgZyA9ICc8ZGl2IGNsYXNzPVwiJyArIGsgKyAnXCIgJyArIChBID8gJ3JvbGU9XCInICsgY1tuXSArICdcIiAnIDogXCJcIik7XG4gICAgICAgICAgICBtLmxlbmd0aCAmJiBBICYmIG0uZWFjaChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBnICs9ICdhcmlhLWxhYmVsbGVkYnk9XCInO1xuICAgICAgICAgICAgICAgIHRoaXMuaWQgPyBnICs9IHRoaXMuaWQgOiAodGhpcy5pZCA9IEUsIGcgKz0gRSk7XG4gICAgICAgICAgICAgICAgZyArPSAnXCInXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGcgPSBhLndyYXAoZyArIFwiLz5cIilbcF0oXCJpZkNyZWF0ZWRcIikucGFyZW50KCkuYXBwZW5kKGYuaW5zZXJ0KTtcbiAgICAgICAgICAgIGQgPSBoKCc8aW5zIGNsYXNzPVwiJyArIEkgKyAnXCIvPicpLmNzcyhkKS5hcHBlbmRUbyhnKTtcbiAgICAgICAgICAgIGEuZGF0YShxLCB7bzogZiwgczogYS5hdHRyKFwic3R5bGVcIil9KS5jc3MoZSk7XG4gICAgICAgICAgICBmLmluaGVyaXRDbGFzcyAmJiBnW3ZdKGMuY2xhc3NOYW1lIHx8IFwiXCIpO1xuICAgICAgICAgICAgZi5pbmhlcml0SUQgJiYgYiAmJiBnLmF0dHIoXCJpZFwiLCBxICsgXCItXCIgKyBiKTtcbiAgICAgICAgICAgIFwic3RhdGljXCIgPT0gZy5jc3MoXCJwb3NpdGlvblwiKSAmJiBnLmNzcyhcInBvc2l0aW9uXCIsIFwicmVsYXRpdmVcIik7XG4gICAgICAgICAgICBGKGEsICEwLCBIKTtcbiAgICAgICAgICAgIGlmIChtLmxlbmd0aClcbiAgICAgICAgICAgICAgICBtLm9uKFwiY2xpY2suaSBtb3VzZW92ZXIuaSBtb3VzZW91dC5pIHRvdWNoYmVnaW4uaSB0b3VjaGVuZC5pXCIsIGZ1bmN0aW9uKGIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGQgPSBiW25dLCBlID0gaCh0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjW3NdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoXCJjbGlja1wiID09IGQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaChiLnRhcmdldCkuaXMoXCJhXCIpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgRihhLCAhMSwgITApXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB5ICYmICgvdXR8bmQvLnRlc3QoZCkgPyAoZ1t6XShCKSwgZVt6XShDKSkgOiAoZ1t2XShCKSwgZVt2XShDKSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKEopXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYi5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4hMVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBhLm9uKFwiY2xpY2suaSBmb2N1cy5pIGJsdXIuaSBrZXl1cC5pIGtleWRvd24uaSBrZXlwcmVzcy5pXCIsIGZ1bmN0aW9uKGIpIHtcbiAgICAgICAgICAgICAgICB2YXIgZCA9IGJbbl07XG4gICAgICAgICAgICAgICAgYiA9IGIua2V5Q29kZTtcbiAgICAgICAgICAgICAgICBpZiAoXCJjbGlja1wiID09IGQpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiExO1xuICAgICAgICAgICAgICAgIGlmIChcImtleWRvd25cIiA9PSBkICYmIDMyID09IGIpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjW25dID09IHUgJiYgY1tsXSB8fCAoY1tsXSA/IHQoYSwgbCkgOiBEKGEsIGwpKSwgITE7XG4gICAgICAgICAgICAgICAgaWYgKFwia2V5dXBcIiA9PSBkICYmIGNbbl0gPT0gdSlcbiAgICAgICAgICAgICAgICAgICAgIWNbbF0gJiYgRChhLCBsKTtcbiAgICAgICAgICAgICAgICBlbHNlIGlmICgvdXN8dXIvLnRlc3QoZCkpXG4gICAgICAgICAgICAgICAgICAgIGdbXCJibHVyXCIgPT1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkID8geiA6IHZdKHgpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGQub24oXCJjbGljayBtb3VzZWRvd24gbW91c2V1cCBtb3VzZW92ZXIgbW91c2VvdXQgdG91Y2hiZWdpbi5pIHRvdWNoZW5kLmlcIiwgZnVuY3Rpb24oYikge1xuICAgICAgICAgICAgICAgIHZhciBkID0gYltuXSwgZSA9IC93bnx1cC8udGVzdChkKSA/IHcgOiBCO1xuICAgICAgICAgICAgICAgIGlmICghY1tzXSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoXCJjbGlja1wiID09IGQpXG4gICAgICAgICAgICAgICAgICAgICAgICBGKGEsICExLCAhMCk7XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKC93bnxlcnxpbi8udGVzdChkKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBnW3ZdKGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdbel0oZSArIFwiIFwiICsgdyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobS5sZW5ndGggJiYgeSAmJiBlID09IEIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbVsvdXR8bmQvLnRlc3QoZCkgPyB6IDogdl0oQylcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoSilcbiAgICAgICAgICAgICAgICAgICAgICAgIGIuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiExXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfSlcbiAgICB9XG59KSh3aW5kb3cualF1ZXJ5IHx8IHdpbmRvdy5aZXB0byk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL0FkbWluTFRFXFxcXGFwcC5qc1wiLFwiL0FkbWluTFRFXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLypcbiAqIEF1dGhvcjogQWJkdWxsYWggQSBBbG1zYWVlZFxuICogRGF0ZTogNCBKYW4gMjAxNFxuICogRGVzY3JpcHRpb246XG4gKiAgICAgIFRoaXMgaXMgYSBkZW1vIGZpbGUgdXNlZCBvbmx5IGZvciB0aGUgbWFpbiBkYXNoYm9hcmQgKGluZGV4Lmh0bWwpXG4gKiovXG5cbiQoZnVuY3Rpb24oKSB7XG4gICAgXCJ1c2Ugc3RyaWN0XCI7XG5cblxufSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL0FkbWluTFRFXFxcXGRhc2hib2FyZC5qc1wiLFwiL0FkbWluTFRFXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuJChmdW5jdGlvbigpIHtcbiAgICAvKiBGb3IgZGVtbyBwdXJwb3NlcyAqL1xuICAgIHZhciBkZW1vID0gJChcIjxkaXYgLz5cIikuY3NzKHtcbiAgICAgICAgcG9zaXRpb246IFwiZml4ZWRcIixcbiAgICAgICAgdG9wOiBcIjE1MHB4XCIsXG4gICAgICAgIHJpZ2h0OiBcIjBcIixcbiAgICAgICAgYmFja2dyb3VuZDogXCJyZ2JhKDAsIDAsIDAsIDAuNylcIixcbiAgICAgICAgXCJib3JkZXItcmFkaXVzXCI6IFwiNXB4IDBweCAwcHggNXB4XCIsXG4gICAgICAgIHBhZGRpbmc6IFwiMTBweCAxNXB4XCIsXG4gICAgICAgIFwiZm9udC1zaXplXCI6IFwiMTZweFwiLFxuICAgICAgICBcInotaW5kZXhcIjogXCI5OTk5OTlcIixcbiAgICAgICAgY3Vyc29yOiBcInBvaW50ZXJcIixcbiAgICAgICAgY29sb3I6IFwiI2RkZFwiXG4gICAgfSkuaHRtbChcIjxpIGNsYXNzPSdmYSBmYS1nZWFyJz48L2k+XCIpLmFkZENsYXNzKFwibm8tcHJpbnRcIik7XG5cbiAgICB2YXIgZGVtb19zZXR0aW5ncyA9ICQoXCI8ZGl2IC8+XCIpLmNzcyh7XG4gICAgICAgIFwicGFkZGluZ1wiOiBcIjEwcHhcIixcbiAgICAgICAgcG9zaXRpb246IFwiZml4ZWRcIixcbiAgICAgICAgdG9wOiBcIjEzMHB4XCIsXG4gICAgICAgIHJpZ2h0OiBcIi0yMDBweFwiLFxuICAgICAgICBiYWNrZ3JvdW5kOiBcIiNmZmZcIixcbiAgICAgICAgYm9yZGVyOiBcIjNweCBzb2xpZCByZ2JhKDAsIDAsIDAsIDAuNylcIixcbiAgICAgICAgXCJ3aWR0aFwiOiBcIjIwMHB4XCIsXG4gICAgICAgIFwiei1pbmRleFwiOiBcIjk5OTk5OVwiXG4gICAgfSkuYWRkQ2xhc3MoXCJuby1wcmludFwiKTtcbiAgICBkZW1vX3NldHRpbmdzLmFwcGVuZChcbiAgICAgICAgICAgIFwiPGg0IHN0eWxlPSdtYXJnaW46IDAgMCA1cHggMDsgYm9yZGVyLWJvdHRvbTogMXB4IGRhc2hlZCAjZGRkOyBwYWRkaW5nLWJvdHRvbTogM3B4Oyc+TGF5b3V0IE9wdGlvbnM8L2g0PlwiXG4gICAgICAgICAgICArIFwiPGRpdiBjbGFzcz0nZm9ybS1ncm91cCBuby1tYXJnaW4nPlwiXG4gICAgICAgICAgICArIFwiPGRpdiBjbGFzcz0nLmNoZWNrYm94Jz5cIlxuICAgICAgICAgICAgKyBcIjxsYWJlbD5cIlxuICAgICAgICAgICAgKyBcIjxpbnB1dCB0eXBlPSdjaGVja2JveCcgb25jaGFuZ2U9J2NoYW5nZV9sYXlvdXQoKTsnLz4gXCJcbiAgICAgICAgICAgICsgXCJGaXhlZCBsYXlvdXRcIlxuICAgICAgICAgICAgKyBcIjwvbGFiZWw+XCJcbiAgICAgICAgICAgICsgXCI8L2Rpdj5cIlxuICAgICAgICAgICAgKyBcIjwvZGl2PlwiXG4gICAgICAgICAgICApO1xuICAgIGRlbW9fc2V0dGluZ3MuYXBwZW5kKFxuICAgICAgICAgICAgXCI8aDQgc3R5bGU9J21hcmdpbjogMCAwIDVweCAwOyBib3JkZXItYm90dG9tOiAxcHggZGFzaGVkICNkZGQ7IHBhZGRpbmctYm90dG9tOiAzcHg7Jz5Ta2luczwvaDQ+XCJcbiAgICAgICAgICAgICsgXCI8ZGl2IGNsYXNzPSdmb3JtLWdyb3VwIG5vLW1hcmdpbic+XCJcbiAgICAgICAgICAgICsgXCI8ZGl2IGNsYXNzPScucmFkaW8nPlwiXG4gICAgICAgICAgICArIFwiPGxhYmVsPlwiXG4gICAgICAgICAgICArIFwiPGlucHV0IG5hbWU9J3NraW5zJyB0eXBlPSdyYWRpbycgb25jaGFuZ2U9J2NoYW5nZV9za2luKFxcXCJza2luLWJsYWNrXFxcIik7JyAvPiBcIlxuICAgICAgICAgICAgKyBcIkJsYWNrXCJcbiAgICAgICAgICAgICsgXCI8L2xhYmVsPlwiXG4gICAgICAgICAgICArIFwiPC9kaXY+XCJcbiAgICAgICAgICAgICsgXCI8L2Rpdj5cIlxuXG4gICAgICAgICAgICArIFwiPGRpdiBjbGFzcz0nZm9ybS1ncm91cCBuby1tYXJnaW4nPlwiXG4gICAgICAgICAgICArIFwiPGRpdiBjbGFzcz0nLnJhZGlvJz5cIlxuICAgICAgICAgICAgKyBcIjxsYWJlbD5cIlxuICAgICAgICAgICAgKyBcIjxpbnB1dCBuYW1lPSdza2lucycgdHlwZT0ncmFkaW8nIG9uY2hhbmdlPSdjaGFuZ2Vfc2tpbihcXFwic2tpbi1ibHVlXFxcIik7JyBjaGVja2VkPSdjaGVja2VkJy8+IFwiXG4gICAgICAgICAgICArIFwiQmx1ZVwiXG4gICAgICAgICAgICArIFwiPC9sYWJlbD5cIlxuICAgICAgICAgICAgKyBcIjwvZGl2PlwiXG4gICAgICAgICAgICArIFwiPC9kaXY+XCJcbiAgICAgICAgICAgICk7XG5cbiAgICBkZW1vLmNsaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAoISQodGhpcykuaGFzQ2xhc3MoXCJvcGVuXCIpKSB7XG4gICAgICAgICAgICAkKHRoaXMpLmNzcyhcInJpZ2h0XCIsIFwiMjAwcHhcIik7XG4gICAgICAgICAgICBkZW1vX3NldHRpbmdzLmNzcyhcInJpZ2h0XCIsIFwiMFwiKTtcbiAgICAgICAgICAgICQodGhpcykuYWRkQ2xhc3MoXCJvcGVuXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJCh0aGlzKS5jc3MoXCJyaWdodFwiLCBcIjBcIik7XG4gICAgICAgICAgICBkZW1vX3NldHRpbmdzLmNzcyhcInJpZ2h0XCIsIFwiLTIwMHB4XCIpO1xuICAgICAgICAgICAgJCh0aGlzKS5yZW1vdmVDbGFzcyhcIm9wZW5cIilcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgJChcImJvZHlcIikuYXBwZW5kKGRlbW8pO1xuICAgICQoXCJib2R5XCIpLmFwcGVuZChkZW1vX3NldHRpbmdzKTtcbn0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJodFpreDRcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9BZG1pbkxURVxcXFxkZW1vLmpzXCIsXCIvQWRtaW5MVEVcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5yZXF1aXJlKCcuL0FkbWluTFRFL2FwcCcpO1xucmVxdWlyZSgnLi9BZG1pbkxURS9kYXNoYm9hcmQnKTtcbnJlcXVpcmUoJy4vQWRtaW5MVEUvZGVtbycpO1xuXG5yZXF1aXJlKCcuLi9jb250cm9sbGVycy9fbW9kdWxlX2luaXQnKTtcbnJlcXVpcmUoJy4uL3NlcnZpY2VzL19tb2R1bGVfaW5pdCcpO1xucmVxdWlyZSgnLi4vZGlyZWN0aXZlcy9fbW9kdWxlX2luaXQnKTtcbnJlcXVpcmUoJy4uL2NvbmZpZy9fbW9kdWxlX2luaXQnKTtcbnJlcXVpcmUoJy4uL2NvbnRyb2xzL19tb2R1bGVfaW5pdCcpO1xuXG5hbmd1bGFyLmVsZW1lbnQoZG9jdW1lbnQpLnJlYWR5KGZ1bmN0aW9uKCkge1xuXG5cdHZhciByZXF1aXJlcyA9IFtcblx0XHQndWkucm91dGVyJyxcblx0XHQnbmdSZXNvdXJjZScsXG5cdFx0J2FwcC5jb25maWcnLFxuXHRcdCdhcHAuY29udHJvbHMnLFxuXHRcdCdhcHAuY29udHJvbGxlcnMnLFxuXHRcdCdhcHAuc2VydmljZXMnLFxuXHRcdCdhcHAuZGlyZWN0aXZlcycsXG5cdF07XG5cblx0dmFyIGFwcCA9IGFuZ3VsYXIubW9kdWxlKCdhcHAnLCByZXF1aXJlcyk7XG5cblx0YXBwLmNvbmZpZyhbJyRodHRwUHJvdmlkZXInLCAnJHNjZURlbGVnYXRlUHJvdmlkZXInLFxuXHRcdGZ1bmN0aW9uKCRodHRwUHJvdmlkZXIsICRzY2VEZWxlZ2F0ZVByb3ZpZGVyKSB7XG5cdFx0XHQkaHR0cFByb3ZpZGVyLmRlZmF1bHRzLnVzZVhEb21haW4gPSB0cnVlO1xuXHRcdFx0JHNjZURlbGVnYXRlUHJvdmlkZXIucmVzb3VyY2VVcmxXaGl0ZWxpc3QoWydzZWxmJywgL15odHRwcz86XFwvXFwvKGNkblxcLik/cXVhZHJhbW1hLmNvbS9dKTtcblx0XHRcdGRlbGV0ZSAkaHR0cFByb3ZpZGVyLmRlZmF1bHRzLmhlYWRlcnMuY29tbW9uWydYLVJlcXVlc3RlZC1XaXRoJ107XG5cdFx0fVxuXHRdKTtcblxuXHRhcHAucnVuKFtcblx0XHQnJFFKQ29uZmlnJyxcblx0XHRmdW5jdGlvbigkUUpDb25maWcpIHtcblx0XHRcdC8vc3RvcmUuY2xlYXIoKTtcblx0XHRcdCRRSkNvbmZpZy5jb25maWd1cmUoKTtcblx0XHR9XG5cdF0pO1xuXG5cblx0YW5ndWxhci5ib290c3RyYXAoZG9jdW1lbnQsIFsnYXBwJ10pO1xuXG59KTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiaHRaa3g0XCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvZmFrZV8zZGY0ZjEzZS5qc1wiLFwiL1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbm1vZHVsZS5leHBvcnRzID0gYW5ndWxhci5tb2R1bGUoJ2FwcC5zZXJ2aWNlcycsIFtdKTtcbnJlcXVpcmUoJy4vYXBpU2VydmljZS5qcycpO1xucmVxdWlyZSgnLi9hdXRoU2VydmljZS5qcycpO1xucmVxdWlyZSgnLi9jb25maWdTZXJ2aWNlLmpzJyk7XG5yZXF1aXJlKCcuL2Vycm9ySGFuZGxlclNlcnZpY2UuanMnKTtcbnJlcXVpcmUoJy4vaGVscGVyU2VydmljZS5qcycpXG5yZXF1aXJlKCcuL2xvY2FsU2Vzc2lvblNlcnZpY2UuanMnKTtcbnJlcXVpcmUoJy4vbG9nZ2VyU2VydmljZS5qcycpO1xucmVxdWlyZSgnLi9sb2dpblNlcnZpY2UuanMnKTtcbnJlcXVpcmUoJy4vdGltZVNlcnZpY2UuanMnKTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiaHRaa3g0XCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi5cXFxcc2VydmljZXNcXFxcX21vZHVsZV9pbml0LmpzXCIsXCIvLi5cXFxcc2VydmljZXNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgbW9kdWxlID0gcmVxdWlyZSgnLi9fbW9kdWxlX2luaXQuanMnKTtcbm1vZHVsZS5mYWN0b3J5KCckUUpBcGknLCBbJyRRSlRpbWUnLCAnJFFKTG9jYWxTZXNzaW9uJywgJyRRSkxvZ2dlcicsIFwiJFFKQ29uZmlnXCIsIFwiJHJlc291cmNlXCIsICckUUpFcnJvckhhbmRsZXInLCAnJHJvb3RTY29wZScsXG5cdGZ1bmN0aW9uKCRRSlRpbWUsICRRSkxvY2FsU2Vzc2lvbiwgJFFKTG9nZ2VyLCAkUUpDb25maWcsICRyZXNvdXJjZSwgJFFKRXJyb3JIYW5kbGVyLCAkcm9vdFNjb3BlKSB7XG5cdFx0dmFyIHJ0YSA9IG5ldyhmdW5jdGlvbigpIHtcblxuXHRcdFx0Ly9hcGkgaW4gcm9vdFxuXHRcdFx0aWYgKF8uaXNVbmRlZmluZWQoJHJvb3RTY29wZS5hcGkpKSB7XG5cdFx0XHRcdHZhciBfYXBpSW5mbyA9IHtcblx0XHRcdFx0XHRzdGF0dXM6ICdXYWl0aW5nJyxcblx0XHRcdFx0XHRjYWxsczogW10sXG5cdFx0XHRcdFx0Y2FsbHNfd29ya2luZzogMCxcblx0XHRcdFx0XHRjYWxsc19maW5pc2hlZDogMCxcblx0XHRcdFx0XHRjYWxsc0luUHJvZ3Jlc3M6IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0dmFyIGFzZCA9IChfLmZpbHRlcihfYXBpSW5mby5jYWxscywgZnVuY3Rpb24oY2FsbCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gY2FsbC5lbmRlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHR9KSkubGVuZ3RoKCk7XG5cblx0XHRcdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0c3RhcnQ6IGZ1bmN0aW9uKGluZm8pIHtcblx0XHRcdFx0XHRcdHZhciBjYWxsID0ge1xuXHRcdFx0XHRcdFx0XHRpbmZvOiBpbmZvLFxuXHRcdFx0XHRcdFx0XHRlbmRlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdHN0YXJ0VGltZTogKG5ldyBEYXRlKCkpLmdldFRpbWUoKSxcblx0XHRcdFx0XHRcdFx0ZW5kVGltZTogbnVsbCxcblx0XHRcdFx0XHRcdFx0ZHVyYXRpb246IG51bGxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRfYXBpSW5mby5jYWxsc193b3JraW5nICs9IDE7XG5cdFx0XHRcdFx0XHRfYXBpSW5mby5zdGF0dXMgPSAnV29ya2luZyc7XG5cdFx0XHRcdFx0XHRfYXBpSW5mby5jYWxscy5wdXNoKGNhbGwpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgLy9yZXByZXNlbnRzIHRoZSBjYWxsXG5cdFx0XHRcdFx0XHRcdGVuZDogZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y2FsbC5lbmRlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdFx0Y2FsbC5lbmRUaW1lID0gKG5ldyBEYXRlKCkpLmdldFRpbWUoKTtcblx0XHRcdFx0XHRcdFx0XHRjYWxsLmR1cmF0aW9uID0gKGNhbGwuc3RhcnRUaW1lIC0gY2FsbC5lbmRUaW1lKSAvIDEwMDsgLy9kdXIgaW4gc2Vjcy5cblx0XHRcdFx0XHRcdFx0XHRfYXBpSW5mby5jYWxsc193b3JraW5nIC09IDE7XG5cdFx0XHRcdFx0XHRcdFx0X2FwaUluZm8uY2FsbHNfZmluaXNoZWQgKz0gMTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoX2FwaUluZm8uY2FsbHNfd29ya2luZyA9PSAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRfYXBpSW5mby5zdGF0dXMgPSAnV2FpdGluZyc7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YnVpbGRDYWNoZUl0ZW1JZDogZnVuY3Rpb24oY3RybE5hbWUsIHBhcmFtcywgcG9zdERhdGEpIHtcblx0XHRcdFx0XHRcdHZhciBjb25jYXQgPSBjdHJsTmFtZTtcblx0XHRcdFx0XHRcdGZvciAodmFyIHggaW4gcGFyYW1zKSB7XG5cdFx0XHRcdFx0XHRcdHZhciBwYXJhbSA9IHBhcmFtc1t4XTtcblx0XHRcdFx0XHRcdFx0Y29uY2F0ICs9IHBhcmFtO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Zm9yICh2YXIgeCBpbiBwb3N0RGF0YSkge1xuXHRcdFx0XHRcdFx0XHR2YXIgZGF0YSA9IHBvc3REYXRhW3hdO1xuXHRcdFx0XHRcdFx0XHRjb25jYXQgKz0gZGF0YTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBjb25jYXQ7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRuZXdDYWNoZUl0ZW1GdW5jdDogZnVuY3Rpb24oY2FjaGVJdGVtKSB7XG5cdFx0XHRcdFx0XHRjYWNoZUl0ZW0uc2V0UmVzID0gZnVuY3Rpb24ocmVzKSB7XG5cdFx0XHRcdFx0XHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRcdFx0XHRcdFx0JFFKTG9jYWxTZXNzaW9uLmFkZChmdW5jdGlvbihzZXNzaW9uKSB7XG5cdFx0XHRcdFx0XHRcdFx0c2Vzc2lvbi5odHRwY2FjaGVbc2VsZi5pbmRleF0ucmVzID0gcmVzO1xuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRjYWNoZUl0ZW0uaGFzUmVzID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLnJlcyAhPSBudWxsO1xuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHJldHVybiBjYWNoZUl0ZW07XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRuZXdDYWNoZUl0ZW06IGZ1bmN0aW9uKHBhcmFtcykge1xuXHRcdFx0XHRcdFx0dmFyIHJ0YSA9IHtcblx0XHRcdFx0XHRcdFx0aWQ6IHBhcmFtcy5pZCxcblx0XHRcdFx0XHRcdFx0aW5kZXg6IHBhcmFtcy5pbmRleCxcblx0XHRcdFx0XHRcdFx0cGFyYW1zOiB7fSxcblx0XHRcdFx0XHRcdFx0cG9zdERhdGE6IHt9LFxuXHRcdFx0XHRcdFx0XHRyZXM6IG51bGwsXG5cdFx0XHRcdFx0XHRcdGV4cGlyYXRpb246IChuZXcgRGF0ZSgpKS5nZXRUaW1lKCksXG5cdFx0XHRcdFx0XHRcdGV4cGlyZWluOiAkUUpUaW1lLmdldFRpbWVzdGFtcER1cmF0aW9uKFxuXHRcdFx0XHRcdFx0XHRcdCRyb290U2NvcGUuY29uZmlnLmNhY2hlX2V4cGlyYXRpb25fbWludXRlcyAvIDEwMDBcblx0XHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHJ0YSA9IHRoaXMubmV3Q2FjaGVJdGVtRnVuY3QocnRhKTtcblx0XHRcdFx0XHRcdHJldHVybiBydGE7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRDYWNoZTogZnVuY3Rpb24oY3RybE5hbWUsIHBhcmFtcywgcG9zdERhdGEpIHtcblx0XHRcdFx0XHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRcdFx0XHRcdHZhciBpZCA9IHRoaXMuYnVpbGRDYWNoZUl0ZW1JZChjdHJsTmFtZSwgcGFyYW1zLCBwb3N0RGF0YSk7XG5cblx0XHRcdFx0XHRcdGlmICghXy5pc1VuZGVmaW5lZChwYXJhbXMuaWdub3JlY2FjaGUpICYmIHBhcmFtcy5pZ25vcmVjYWNoZSA9PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdFx0aGFzUmVzOiBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdHNldFJlczogZnVuY3Rpb24oKSB7fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmICghJHJvb3RTY29wZS5zZXNzaW9uLmh0dHBjYWNoZSkgJHJvb3RTY29wZS5zZXNzaW9uLmh0dHBjYWNoZSA9IFtdO1xuXHRcdFx0XHRcdFx0Ly90cnlnZXRcblx0XHRcdFx0XHRcdHZhciBydGFjYWNoZSA9IG51bGw7XG5cdFx0XHRcdFx0XHRmb3IgKHZhciB4IGluICRyb290U2NvcGUuc2Vzc2lvbi5odHRwY2FjaGUpIHtcblx0XHRcdFx0XHRcdFx0dmFyIGl0ZW0gPSAkcm9vdFNjb3BlLnNlc3Npb24uaHR0cGNhY2hlW3hdO1xuXHRcdFx0XHRcdFx0XHRpZiAoaXRlbS5pZCA9PSBpZCkge1xuXHRcdFx0XHRcdFx0XHRcdHJ0YWNhY2hlID0gaXRlbTtcblxuXHRcdFx0XHRcdFx0XHRcdHZhciBkaWZmID1cblx0XHRcdFx0XHRcdFx0XHRcdChydGFjYWNoZS5leHBpcmF0aW9uICsgKChwYXJzZUludCgkcm9vdFNjb3BlLmNvbmZpZy5jYWNoZV9leHBpcmF0aW9uX21pbnV0ZXMpICogNjApICogMTAwMCkpIC1cblx0XHRcdFx0XHRcdFx0XHRcdChuZXcgRGF0ZSgpKS5nZXRUaW1lKCk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGRpZmYgPCAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRydGFjYWNoZSA9IG51bGw7XG5cdFx0XHRcdFx0XHRcdFx0XHQkcm9vdFNjb3BlLnNlc3Npb24uaHR0cGNhY2hlLnNwbGljZSh4LCAxKTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXG5cdFx0XHRcdFx0XHRcdFx0XHRydGFjYWNoZS5leHBpcmVpbiA9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdCRRSlRpbWUuZ2V0VGltZXN0YW1wRHVyYXRpb24oZGlmZik7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoXy5pc1VuZGVmaW5lZChydGFjYWNoZSkgfHwgXy5pc051bGwocnRhY2FjaGUpKSB7XG5cdFx0XHRcdFx0XHRcdHZhciBuZXdJdGVtID0gc2VsZi5uZXdDYWNoZUl0ZW0oe1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBpZCxcblx0XHRcdFx0XHRcdFx0XHRpbmRleDogJHJvb3RTY29wZS5zZXNzaW9uLmh0dHBjYWNoZS5sZW5ndGhcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdCRyb290U2NvcGUuc2Vzc2lvbi5odHRwY2FjaGUucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IG5ld0l0ZW0uaWQsXG5cdFx0XHRcdFx0XHRcdFx0aW5kZXg6IG5ld0l0ZW0uaW5kZXgsXG5cdFx0XHRcdFx0XHRcdFx0cGFyYW1zOiBuZXdJdGVtLnBhcmFtcyxcblx0XHRcdFx0XHRcdFx0XHRwb3N0RGF0YTogbmV3SXRlbS5wb3N0RGF0YSxcblx0XHRcdFx0XHRcdFx0XHRyZXM6IG5ld0l0ZW0ucmVzLFxuXHRcdFx0XHRcdFx0XHRcdGV4cGlyYXRpb246IG5ld0l0ZW0uZXhwaXJhdGlvbixcblx0XHRcdFx0XHRcdFx0XHRleHBpcmF0aW9uX3NlY29uZHM6IG5ld0l0ZW0uZXhwaXJhdGlvbl9zZWNvbmRzXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHQkUUpMb2NhbFNlc3Npb24uc2F2ZSgpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbmV3SXRlbTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHJ0YWNhY2hlID0gc2VsZi5uZXdDYWNoZUl0ZW1GdW5jdChydGFjYWNoZSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBydGFjYWNoZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Lypcblx0XHRcdFx0dmFyIGNhbGwgPSBfYXBpSW5mby5zdGFydCh7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdUZXN0IHRhc2sgZm9yIGFwaSdcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNhbGwuZW5kKCk7XG5cdFx0XHRcdCovXG5cblx0XHRcdFx0JHJvb3RTY29wZS5hcGkgPSBfYXBpSW5mbztcblx0XHRcdFx0Z2FwaSA9ICRyb290U2NvcGUuYXBpO1xuXHRcdFx0fVxuXG5cblxuXHRcdFx0Ly8tLUNMQVNTIERFRlxuXHRcdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0XHQvL1BSSVZBVEVFXG5cdFx0XHRmdW5jdGlvbiBoYXNSZXBvcnRlZEVycm9ycyhyZXMsIGlnbm9yZUJhZFJlcXVlc3QpIHtcblx0XHRcdFx0aWYgKHJlcyAmJiBfLmlzVW5kZWZpbmVkKHJlcy5vaykpIHtcblx0XHRcdFx0XHQvL2NvbnNvbGUubG9nKHJlcyk7XG5cdFx0XHRcdFx0JFFKRXJyb3JIYW5kbGVyLmhhbmRsZSgkUUpFcnJvckhhbmRsZXIuY29kZXMuQVBJX0lOVkFMSURfUkVTUE9OU0UsIHJlcyk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHJlcyAmJiAhXy5pc1VuZGVmaW5lZChyZXMub2spICYmIHJlcy5vayA9PSBmYWxzZSAmJiAhaWdub3JlQmFkUmVxdWVzdCkge1xuXG5cdFx0XHRcdFx0aWYgKHJlcyAmJiAhXy5pc1VuZGVmaW5lZChyZXMuZXJyb3Jjb2RlKSkge1xuXHRcdFx0XHRcdFx0JFFKTG9nZ2VyLmxvZygnYXBpIHdhcm5pbmcgLT4gaGFuZGxpbmcgZXJyb3Jjb2RlICcgKyByZXMuZXJyb3Jjb2RlKTtcblx0XHRcdFx0XHRcdCRRSkVycm9ySGFuZGxlci5oYW5kbGUocmVzLmVycm9yY29kZSwgcmVzKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQkUUpFcnJvckhhbmRsZXIuaGFuZGxlKCRRSkVycm9ySGFuZGxlci5BUElfUkVTUE9OU0VfSEFTX0VSUk9SU19XSVRIT1VUX0VSUk9SQ09ERSwgcmVzKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCRRSkVycm9ySGFuZGxlci5oYW5kbGUoJFFKRXJyb3JIYW5kbGVyLmNvZGVzLkFQSV9SRVNQT05TRV9IQVNfRVJST1JTLCByZXMpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0ZnVuY3Rpb24gZ2V0Q29udHJvbGxlcihjb250cm9sbGVyTmFtZSwgaWdub3JlQmFkUmVxdWVzdCkge1xuXHRcdFx0XHR2YXIgJHJlcyA9ICRyZXNvdXJjZSgkcm9vdFNjb3BlLmNvbmZpZy5hcGkgKyAnLzpjb250cm9sbGVyLzphY3Rpb24vOmlkJywge30sIHtcblx0XHRcdFx0XHRxdWVyeToge1xuXHRcdFx0XHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdFx0XHRcdFx0aXNBcnJheTogdHJ1ZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0OiB7XG5cdFx0XHRcdFx0XHRtZXRob2Q6IFwiR0VUXCIsXG5cdFx0XHRcdFx0XHRpc0FycmF5OiBmYWxzZSxcblx0XHRcdFx0XHRcdHBhcmFtczoge1xuXHRcdFx0XHRcdFx0XHRjb250cm9sbGVyOiBjb250cm9sbGVyTmFtZVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0XHRpc0FycmF5OiBmYWxzZSxcblx0XHRcdFx0XHRcdHBhcmFtczoge1xuXHRcdFx0XHRcdFx0XHRjb250cm9sbGVyOiBjb250cm9sbGVyTmFtZVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0c2F2ZToge1xuXHRcdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0XHRpc0FycmF5OiBmYWxzZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dXBkYXRlOiB7XG5cdFx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRcdGlzQXJyYXk6IGZhbHNlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRkZWxldGU6IHtcblx0XHRcdFx0XHRcdG1ldGhvZDogXCJERUxFVEVcIixcblx0XHRcdFx0XHRcdGlzQXJyYXk6IGZhbHNlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dmFyIGNvbnRyb2xsZXIgPSB7fTtcblx0XHRcdFx0Y29udHJvbGxlci5oYXNSZXBvcnRlZEVycm9ycyA9IGhhc1JlcG9ydGVkRXJyb3JzO1xuXHRcdFx0XHRjb250cm9sbGVyLnBvc3QgPSBmdW5jdGlvbihwYXJhbXMsIHBvc3REYXRhLCBzdWNjZXNzKSB7XG5cblx0XHRcdFx0XHR2YXIgY2FjaGUgPSAkcm9vdFNjb3BlLmFwaS5nZXRDYWNoZShjb250cm9sbGVyTmFtZSwgcGFyYW1zLCBwb3N0RGF0YSk7XG5cdFx0XHRcdFx0aWYgKGNhY2hlLmhhc1JlcygpKSB7XG5cdFx0XHRcdFx0XHRpZiAoIWhhc1JlcG9ydGVkRXJyb3JzKGNhY2hlLnJlcywgaWdub3JlQmFkUmVxdWVzdCkpIHtcblx0XHRcdFx0XHRcdFx0c3VjY2VzcyhjYWNoZS5yZXMpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHZhciBjYWxsID0gJHJvb3RTY29wZS5hcGkuc3RhcnQocGFyYW1zKTtcblxuXHRcdFx0XHRcdGlmIChwYXJhbXMgJiYgcGFyYW1zLmlnbm9yZWNhY2hlKSB7XG5cdFx0XHRcdFx0XHRkZWxldGUocGFyYW1zLmlnbm9yZWNhY2hlKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQkcmVzLnJlcXVlc3QocGFyYW1zLCBwb3N0RGF0YSwgZnVuY3Rpb24ocmVzKSB7XG5cdFx0XHRcdFx0XHRjYWxsLmVuZCgpO1xuXHRcdFx0XHRcdFx0aWYgKCFoYXNSZXBvcnRlZEVycm9ycyhyZXMsIGlnbm9yZUJhZFJlcXVlc3QpKSB7XG5cdFx0XHRcdFx0XHRcdHN1Y2Nlc3MocmVzKTtcblx0XHRcdFx0XHRcdFx0Y2FjaGUuc2V0UmVzKHJlcyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRjYWxsLmVuZCgpO1xuXHRcdFx0XHRcdFx0JFFKRXJyb3JIYW5kbGVyLmhhbmRsZSgkUUpFcnJvckhhbmRsZXIuY29kZXMuQVBJX0VSUk9SKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250cm9sbGVyLmdldCA9IGZ1bmN0aW9uKHBhcmFtcywgc3VjY2Vzcykge1xuXHRcdFx0XHRcdHZhciBjYWNoZSA9ICRyb290U2NvcGUuYXBpLmdldENhY2hlKGNvbnRyb2xsZXJOYW1lLCBwYXJhbXMsIHt9KTtcblx0XHRcdFx0XHRpZiAoY2FjaGUuaGFzUmVzKCkpIHtcblx0XHRcdFx0XHRcdGlmICghaGFzUmVwb3J0ZWRFcnJvcnMoY2FjaGUucmVzLCBpZ25vcmVCYWRSZXF1ZXN0KSkge1xuXHRcdFx0XHRcdFx0XHRzdWNjZXNzKGNhY2hlLnJlcyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dmFyIGNhbGwgPSAkcm9vdFNjb3BlLmFwaS5zdGFydChwYXJhbXMpO1xuXG5cdFx0XHRcdFx0aWYgKHBhcmFtcyAmJiBwYXJhbXMuaWdub3JlY2FjaGUpIHtcblx0XHRcdFx0XHRcdGRlbGV0ZShwYXJhbXMuaWdub3JlY2FjaGUpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCRyZXMuZ2V0KHBhcmFtcywgZnVuY3Rpb24ocmVzKSB7XG5cdFx0XHRcdFx0XHRjYWxsLmVuZCgpO1xuXHRcdFx0XHRcdFx0aWYgKCFoYXNSZXBvcnRlZEVycm9ycyhyZXMsIGlnbm9yZUJhZFJlcXVlc3QpKSB7XG5cdFx0XHRcdFx0XHRcdHN1Y2Nlc3MocmVzKTtcblx0XHRcdFx0XHRcdFx0Y2FjaGUuc2V0UmVzKHJlcyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgZnVuY3Rpb24ocmVzKSB7XG5cdFx0XHRcdFx0XHRjYWxsLmVuZCgpO1xuXHRcdFx0XHRcdFx0aWYgKHJlcyAmJiAhXy5pc1VuZGVmaW5lZChyZXMuc3RhdHVzKSAmJiByZXMuc3RhdHVzID09IDUwMCkge1xuXHRcdFx0XHRcdFx0XHQkUUpFcnJvckhhbmRsZXIuaGFuZGxlKCRRSkVycm9ySGFuZGxlci5jb2Rlcy5BUElfSU5URVJOQUxfU0VSVkVSX0VSUk9SKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQkUUpFcnJvckhhbmRsZXIuaGFuZGxlKCRRSkVycm9ySGFuZGxlci5jb2Rlcy5BUElfRVJST1IpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHJldHVybiBjb250cm9sbGVyO1xuXHRcdFx0fVxuXG5cdFx0XHQvL1BVQkxJQyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHRcdFx0c2VsZi5nZXRDb250cm9sbGVyID0gZnVuY3Rpb24oY29udHJvbGxlck5hbWUpIHtcblx0XHRcdFx0cmV0dXJuIGdldENvbnRyb2xsZXIoY29udHJvbGxlck5hbWUsIGZhbHNlKTtcblx0XHRcdH07XG5cdFx0XHRzZWxmLmdldExvZ2luQ29udHJvbGxlciA9IGZ1bmN0aW9uKGNvbnRyb2xsZXJOYW1lKSB7XG5cdFx0XHRcdGNvbnNvbGUuaW5mbyhcImxvZ2luIGNvbnRyb2xsZXIgcmV0dXJuXCIpO1xuXHRcdFx0XHRyZXR1cm4gZ2V0Q29udHJvbGxlcihjb250cm9sbGVyTmFtZSwgdHJ1ZSk7XG5cdFx0XHR9O1xuXHRcdFx0c2VsZi5pc09LID0gZnVuY3Rpb24oc3VjY2VzcywgZmFpbHVyZSkge1xuXHRcdFx0XHQvL0NoZWNrIGFwaSBzdGF0dXNcblx0XHRcdFx0dmFyIFRlc3QgPSBzZWxmLmdldENvbnRyb2xsZXIoXCJ0ZXN0XCIpO1xuXHRcdFx0XHRUZXN0LmdldCh7XG5cdFx0XHRcdFx0YWN0aW9uOiBcInN0YXR1c1wiXG5cdFx0XHRcdH0sIGZ1bmN0aW9uKHJlcykge1xuXHRcdFx0XHRcdGlmIChyZXMgJiYgIV8uaXNVbmRlZmluZWQocmVzLm9rKSAmJiByZXMub2sgPT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0c3VjY2VzcygpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRmYWlsdXJlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KVxuXHRcdFx0fTtcblx0XHRcdHJldHVybiBzZWxmO1xuXHRcdFx0Ly8tLUNMQVNTIERFRlxuXHRcdH0pKCk7XG5cdFx0cmV0dXJuIHJ0YTsgLy9mYWN0b3J5IHJldHVyblxuXHR9XG5dKTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiaHRaa3g0XCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi5cXFxcc2VydmljZXNcXFxcYXBpU2VydmljZS5qc1wiLFwiLy4uXFxcXHNlcnZpY2VzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIG1vZHVsZSA9IHJlcXVpcmUoJy4vX21vZHVsZV9pbml0LmpzJyk7XG5tb2R1bGUuZmFjdG9yeSgnJFFKQXV0aCcsIFsnJFFKTG9nZ2VyJywgXCIkcm9vdFNjb3BlXCIsIFwiJGh0dHBcIiwgJyRRSkxvY2FsU2Vzc2lvbicsXG5cdGZ1bmN0aW9uKCRRSkxvZ2dlciwgJHJvb3RTY29wZSwgJGh0dHAsICRRSkxvY2FsU2Vzc2lvbikge1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cGRhdGVTZXNzaW9uQ3VzdG9tOiBmdW5jdGlvbih0b2tlbiwgX2dyb3VwX2lkKSB7XG5cdFx0XHRcdCRyb290U2NvcGUuc2Vzc2lvbi50b2tlbiA9IHRva2VuO1xuXHRcdFx0XHQkcm9vdFNjb3BlLnNlc3Npb24uX2dyb3VwX2lkID0gX2dyb3VwX2lkO1xuXHRcdFx0XHQkcm9vdFNjb3BlLmNvbmZpZy5fZ3JvdXBfaWQgPSBfZ3JvdXBfaWQ7XG5cdFx0XHRcdCRRSkxvY2FsU2Vzc2lvbi5zYXZlKCk7XG5cdFx0XHRcdCRyb290U2NvcGUuJGVtaXQoJ3Nlc3Npb24uY2hhbmdlJyk7XG5cdFx0XHRcdCRRSkxvZ2dlci5sb2coJ1FKQXV0aCAtPiB1cGRhdGVTZXNzaW9uQ3VzdG9tIC0+IHRva2VuIC0+JyArIHRva2VuKTtcblx0XHRcdH0sXG5cdFx0XHR1cGRhdGVTZXNzaW9uRnJvbUxvZ2luOiBmdW5jdGlvbihyZXMpIHtcblx0XHRcdFx0JHJvb3RTY29wZS5zZXNzaW9uLmxvZ2lubmFtZSA9IHJlcy5sb2dpbm5hbWU7XG5cdFx0XHRcdCRyb290U2NvcGUuc2Vzc2lvbi50b2tlbiA9IHJlcy50b2tlbjtcblx0XHRcdFx0JHJvb3RTY29wZS5zZXNzaW9uLnRva2VuUmVxID0gcmVzLnRva2VuUmVxO1xuXHRcdFx0XHQkcm9vdFNjb3BlLnNlc3Npb24udG9rZW5FeHAgPSByZXMudG9rZW5FeHA7XG5cdFx0XHRcdCRyb290U2NvcGUuc2Vzc2lvbi5fZ3JvdXBfaWQgPSAkcm9vdFNjb3BlLmNvbmZpZy5fZ3JvdXBfaWQ7XG5cdFx0XHRcdCRRSkxvY2FsU2Vzc2lvbi5zYXZlKCk7XG5cdFx0XHRcdCRyb290U2NvcGUuJGVtaXQoJ3Nlc3Npb24uY2hhbmdlJyk7XG5cdFx0XHRcdCRRSkxvZ2dlci5sb2coJ1FKQXV0aCAtPiB1cGRhdGVTZXNzaW9uRnJvbUxvZ2luIC0+IHRva2VuIC0+JyArIHJlcy50b2tlbik7XG5cblx0XHRcdH1cblx0XHR9XG5cdH1cbl0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJodFpreDRcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLlxcXFxzZXJ2aWNlc1xcXFxhdXRoU2VydmljZS5qc1wiLFwiLy4uXFxcXHNlcnZpY2VzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIG1vZHVsZSA9IHJlcXVpcmUoJy4vX21vZHVsZV9pbml0LmpzJyk7XG5tb2R1bGUuZmFjdG9yeSgnJFFKQ29uZmlnJywgWyckUUpMb2dnZXInLCAnJHJvb3RTY29wZScsICckc3RhdGUnLCAnJHRpbWVvdXQnLCAnJFFKTG9jYWxTZXNzaW9uJywgJyRRSkF1dGgnLFxuXHRmdW5jdGlvbigkUUpMb2dnZXIsICRyb290U2NvcGUsICRzdGF0ZSwgJHRpbWVvdXQsICRRSkxvY2FsU2Vzc2lvbiwgJFFKQXV0aCkge1xuXHRcdHZhciBzZWxmID0ge1xuXHRcdFx0YXBwTmFtZTogJ1FKJyxcblx0XHRcdEFwcElkZW50aWZpZXI6IFwiQXBwSWRlbnRpZmllcl9OQU1FXCIsXG5cdFx0XHQvL2FwaTogXCJodHRwOi8vbG9jYWxob3N0L3FqYXJ2aXMvYXBpXCIsIC8vU0lOICcvJyBBTCBGSU5BTFxuXHRcdFx0Ly9hcGk6IFwiaHR0cDovL3d3dy5xdWFkcmFtbWEuY29tL3BydWViYXMvcWphcnZpcy9hcGlcIiwgLy9TSU4gJy8nIEFMIEZJTkFMICBcblx0XHRcdGFwaTogKGxvY2F0aW9uLm9yaWdpbiArIGxvY2F0aW9uLnBhdGhuYW1lKS50b1N0cmluZygpLnJlcGxhY2UoXCJhZG1pblwiLCBcImFwaVwiKS5zdWJzdHJpbmcoMCwgKGxvY2F0aW9uLm9yaWdpbiArIGxvY2F0aW9uLnBhdGhuYW1lKS50b1N0cmluZygpLnJlcGxhY2UoXCJhZG1pblwiLCBcImFwaVwiKS5sZW5ndGggLSAxKSwgLy9BUEkgSU4gU0FNRSBQTEFDRSAoYWRtaW4sYXBpKSAvL1NJTiAnLycgQUwgRklOQUxcblx0XHRcdGZhY2Vib29rQXBwSUQ6IFwiODE1OTkxNzg1MDc4ODE5XCIsXG5cdFx0XHRfZ3JvdXBfaWQ6IDIsIC8vREVGQVVMVCBRSkFSVklTIEJBQ0tFTkQgKDIpXG5cdFx0XHRsaXN0dmlld0VudHJpZXNQZXJQYWdlOiA1LFxuXHRcdFx0aHRtbFRpdGxlOiBcIlFKYXJ2aXMgfCBEYXNoYm9hcmRcIlxuXHRcdH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbmZpZ3VyZTogZnVuY3Rpb24oKSB7XG5cblxuXHRcdFx0XHQkLmdldEpTT04oXCJjb25maWcuanNvblwiLCBmdW5jdGlvbihkYXRhKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5pbmZvKCdbQ09ORklHLkpTT05dW09LXScpO1xuXHRcdFx0XHRcdHNlbGYuYXBpID0gZGF0YS5hcGk7XG5cdFx0XHRcdFx0c2VsZi5jYWNoZV9leHBpcmF0aW9uX21pbnV0ZXMgPSBkYXRhLmNhY2hlX2V4cGlyYXRpb25fbWludXRlcztcblx0XHRcdFx0fSk7XG5cblxuXHRcdFx0XHQkcm9vdFNjb3BlLmNvbmZpZyA9IHNlbGY7XG5cdFx0XHRcdHZhciBsb2NhbHN0b3JlU2Vzc2lvbkRhdGEgPSAkUUpMb2NhbFNlc3Npb24ubG9hZCgpO1xuXHRcdFx0XHRzZXNzaW9uID0gbG9jYWxzdG9yZVNlc3Npb25EYXRhO1xuXG5cdFx0XHRcdGlmICgoc2Vzc2lvbiAmJiBzZXNzaW9uLl9ncm91cF9pZCkpIHtcblx0XHRcdFx0XHRzZXNzaW9uLmNvbmZpZyA9IHNlbGY7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly9cblx0XHRcdFx0c2VsZi5fZ3JvdXBfaWQgPSAoc2Vzc2lvbiAmJiBzZXNzaW9uLl9ncm91cF9pZCkgPyBzZXNzaW9uLl9ncm91cF9pZCA6IHNlbGYuX2dyb3VwX2lkOyAvL3VwZGF0ZXMgY29uZmlnIHdpdGggc2Vzc2lvbiBfZ3JvdXBfaWRcblx0XHRcdFx0aWYgKGxvY2Fsc3RvcmVTZXNzaW9uRGF0YSkge1xuXHRcdFx0XHRcdCRyb290U2NvcGUuc2Vzc2lvbiA9IGxvY2Fsc3RvcmVTZXNzaW9uRGF0YTtcblx0XHRcdFx0XHQkUUpMb2NhbFNlc3Npb24uc2F2ZSgpO1xuXHRcdFx0XHRcdCRRSkxvZ2dlci5sb2coJ1FKQ29uZmlnLT4gY29uZmlndXJlLT4gc2Vzc2lvbiBpbml0aWFsaXplZCBmcm9tIGxvY2Fsc3RvcmUnKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQkUUpMb2dnZXIubG9nKCdRSkNvbmZpZy0+IGNvbmZpZ3VyZS0+IHNlc3Npb24gaW5pdGlhbGl6ZWQgZnJvbSB6ZXJvJyk7XG5cdFx0XHRcdFx0JHJvb3RTY29wZS5zZXNzaW9uID0ge1xuXHRcdFx0XHRcdFx0bG9naW5uYW1lOiBcIlwiLFxuXHRcdFx0XHRcdFx0dG9rZW46IG51bGwsXG5cdFx0XHRcdFx0XHR0b2tlblJlcTogbnVsbCxcblx0XHRcdFx0XHRcdHRva2VuRXhwOiBudWxsLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly9cblx0XHRcdFx0JHJvb3RTY29wZS5odG1sVGl0bGUgPSAkcm9vdFNjb3BlLmNvbmZpZy5odG1sVGl0bGU7XG5cdFx0XHRcdC8vXG5cdFx0XHRcdCRRSkxvZ2dlci5sb2coJ1FKQ29uZmlnLT4gY29uZmlndXJlLT4gc3VjY2VzcycpO1xuXHRcdFx0XHQvL1xuXG5cblx0XHRcdFx0aWYgKCEkcm9vdFNjb3BlLnNlc3Npb24gfHwgKCRyb290U2NvcGUuc2Vzc2lvbiAmJiBfLmlzVW5kZWZpbmVkKCRyb290U2NvcGUuc2Vzc2lvbi50b2tlbkV4cCkpKSB7XG5cdFx0XHRcdFx0JFFKTG9nZ2VyLmxvZygnUUpIZWxwZXIgLT4gVG9rZW4gLT4gbm90IGF2YWxpYWJsZScpO1xuXHRcdFx0XHRcdCR0aW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0JHN0YXRlLmdvKCdsb2dpbicsIG51bGwpO1xuXHRcdFx0XHRcdH0sIDApO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoJHJvb3RTY29wZS5zZXNzaW9uICYmICRyb290U2NvcGUuc2Vzc2lvbi50b2tlbkV4cCA9PSBudWxsKSB7XG5cdFx0XHRcdFx0JFFKTG9nZ2VyLmxvZygnUUpIZWxwZXIgLT4gVG9rZW4gLT4gbm90IGF2YWxpYWJsZScpO1xuXHRcdFx0XHRcdCR0aW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0JHN0YXRlLmdvKCdsb2dpbicsIG51bGwpO1xuXHRcdFx0XHRcdH0sIDApO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR2YXIgbWlsbGlOb3cgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcblx0XHRcdFx0dmFyIG1pbGxpRGlmZiA9IG1pbGxpTm93IC0gcGFyc2VJbnQoJHJvb3RTY29wZS5zZXNzaW9uLnRva2VuRXhwKTtcblx0XHRcdFx0dmFyIGV4cGlyYXRpb25TZWNvbmRzID0gKE1hdGguYWJzKG1pbGxpRGlmZikgLyAxMDAwKTtcblxuXHRcdFx0XHRpZiAobWlsbGlEaWZmID4gMCkge1xuXHRcdFx0XHRcdCR0aW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0JHN0YXRlLmdvKCdsb2dpbicsIG51bGwpO1xuXHRcdFx0XHRcdH0sIDApO1xuXHRcdFx0XHRcdCRRSkxvZ2dlci5sb2coJ1FKSGVscGVyIC0+IFRva2VuIC0+IGV4cGlyZWQnKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQkUUpMb2dnZXIubG9nKCdRSkhlbHBlciAtPiBUb2tlbiAtPiBleHBpcmVzIGluICcgKyBleHBpcmF0aW9uU2Vjb25kcyArICcgc2Vjb25kcycpO1xuXHRcdFx0XHR9XG5cblxuXHRcdFx0fVxuXHRcdH07XG5cblx0fVxuXSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uXFxcXHNlcnZpY2VzXFxcXGNvbmZpZ1NlcnZpY2UuanNcIixcIi8uLlxcXFxzZXJ2aWNlc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBtb2R1bGUgPSByZXF1aXJlKCcuL19tb2R1bGVfaW5pdC5qcycpO1xubW9kdWxlLmZhY3RvcnkoJyRRSkVycm9ySGFuZGxlcicsIFtcbiAgICAnJFFKTG9nZ2VyJywgJyRzdGF0ZScsICckdGltZW91dCcsICckcm9vdFNjb3BlJyxcbiAgICBmdW5jdGlvbigkUUpMb2dnZXIsICRzdGF0ZSwgJHRpbWVvdXQsICRyb290U2NvcGUpIHtcbiAgICAgICAgdmFyIGNvZGVzID0ge1xuICAgICAgICAgICAgQVBJX0VSUk9SOiAwLCAvL0NMSUVOVCBTSURFXG4gICAgICAgICAgICBBUElfSU5WQUxJRF9SRVNQT05TRTogMSwgLy9DTElFTlQgU0lERVxuICAgICAgICAgICAgQVBJX1JFU1BPTlNFX0hBU19FUlJPUlM6IDIsIC8vU0VSVkVSIFNJREUgS05PV1NcbiAgICAgICAgICAgIEFQSV9UT0tFTl9FWFBJUkVEOiAzLCAvL1NFUlZFUiBTSURFIEtOT1dTXG4gICAgICAgICAgICBBUElfSU5WQUxJRF9UT0tFTjogNCwgLy9TRVJWRVIgU0lERSBLTk9XU1xuICAgICAgICAgICAgQVBJX0lOVkFMSURfQ1JFREVOVElBTFM6IDUsIC8vU0VSVkVSIFNJREUgS05PV1NcbiAgICAgICAgICAgIEFQSV9ST1VURV9OT1RfRk9VTkQ6IDYsIC8vU0VSVkVSIFNJREUgS05PV1NcbiAgICAgICAgICAgIEFQSV9SRVNQT05TRV9IQVNfRVJST1JTX1dJVEhPVVRfRVJST1JDT0RFOiA3LFxuICAgICAgICAgICAgQVBJX0lOVEVSTkFMX1NFUlZFUl9FUlJPUjogNTAwXG4gICAgICAgIH07XG4gICAgICAgIHZhciBjaGFuZ2VTdGF0ZSA9IGZ1bmN0aW9uKHN0YXRlTmFtZSkge1xuICAgICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgJHN0YXRlLmdvKHN0YXRlTmFtZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvZGVzOiBjb2RlcyxcbiAgICAgICAgICAgIGhhbmRsZTogZnVuY3Rpb24oY29kZSwgcmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgICAkcm9vdFNjb3BlLmxhc3RSZXNwb25zZSA9IHJlc3BvbnNlO1xuXG5cbiAgICAgICAgICAgICAgICB2YXIgdmFscyA9IF8ubWFwKHJlc3BvbnNlLCBmdW5jdGlvbihudW0sIGtleSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVtXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnRhY3RlbmVkUmVzcG9uc2UgPSAnJztcbiAgICAgICAgICAgICAgICBmb3IgKHZhciB4IGluIHZhbHMpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGFjdGVuZWRSZXNwb25zZSArPSB2YWxzW3hdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb250YWN0ZW5lZFJlc3BvbnNlID0gY29udGFjdGVuZWRSZXNwb25zZS50b1N0cmluZygpLnJlcGxhY2UoXCIsXCIsIFwiXCIpO1xuXG4gICAgICAgICAgICAgICAgJHJvb3RTY29wZS5sYXN0UmVzcG9uc2VBc1N0cmluZyA9IHZhbHM7XG4gICAgICAgICAgICAgICAgLy8kcm9vdFNjb3BlLmxhc3RSZXNwb25zZUFzU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkocmVzcG9uc2UpO1xuXG4gICAgICAgICAgICAgICAgJHJvb3RTY29wZS5lcnJvciA9IHtcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogXCJTZXJ2ZXIgQVBJIG5vIGFjY2VzaWJsZS4gSW50ZW50ZSBudWV2YW1lbnRlIG1hcyB0YXJkZSBvIGNvbmN0YWN0ZSBhIHNvcG9ydGUuXCJcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGNvZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBjb2Rlcy5BUElfRVJST1I6XG4gICAgICAgICAgICAgICAgICAgICAgICBjaGFuZ2VTdGF0ZShcImVycm9yLWFwaVwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIGNvZGVzLkFQSV9JTlRFUk5BTF9TRVJWRVJfRVJST1I6XG4gICAgICAgICAgICAgICAgICAgICAgICAkcm9vdFNjb3BlLmVycm9yLm1lc3NhZ2UgPSAnKDUwMCkgSW50ZXJuYWwgc2VydmVyIGVycm9yLiBJbnRlbnRlIG51ZXZhbWVudGUgbWFzIHRhcmRlIG8gY29uY3RhY3RlIGEgc29wb3J0ZS4nO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2hhbmdlU3RhdGUoXCJlcnJvci1hcGlcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBjb2Rlcy5BUElfSU5WQUxJRF9SRVNQT05TRTpcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vY2hhbmdlU3RhdGUoXCJlcnJvci1pbnZhbGlkLXJlc3BvbnNlXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKFwiSU5WQUxJRCBSRVNQT05TRSAtPiBcIiArIEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlKS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1teYS16QS1aXSsvZywgXCIuXCIpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIGNvZGVzLkFQSV9SRVNQT05TRV9IQVNfRVJST1JTOlxuICAgICAgICAgICAgICAgICAgICAgICAgLy9jaGFuZ2VTdGF0ZShcImVycm9yLXJlc3BvbnNlLWhhcy1lcnJvcnNcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4ocmVzcG9uc2UubWVzc2FnZSArIFwiIC0+IFwiICsgcmVzcG9uc2UudXJsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIGNvZGVzLkFQSV9SRVNQT05TRV9IQVNfRVJST1JTX1dJVEhPVVRfRVJST1JDT0RFOlxuICAgICAgICAgICAgICAgICAgICAgICAgJHJvb3RTY29wZS5lcnJvci5tZXNzYWdlID0gXCJbQVBJX1JFU1BPTlNFX0hBU19FUlJPUlNfV0lUSE9VVF9FUlJPUkNPREVdW01lc3NhZ2UtPiBcIiArIHJlc3BvbnNlLm1lc3NhZ2UgKyBcIl1cIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5nZVN0YXRlKFwiZXJyb3ItcmVzcG9uc2UtaGFzLWVycm9yc1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIGNvZGVzLkFQSV9UT0tFTl9FWFBJUkVEOlxuICAgICAgICAgICAgICAgICAgICAgICAgJHJvb3RTY29wZS5lcnJvci5tZXNzYWdlID0gJ1N1IHNlc3Npb24gZXhwaXJvJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5nZVN0YXRlKFwibG9naW5cIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBjb2Rlcy5BUElfSU5WQUxJRF9UT0tFTjpcbiAgICAgICAgICAgICAgICAgICAgICAgICRyb290U2NvcGUuZXJyb3IubWVzc2FnZSA9ICdUb2tlbiBpbnZhbGlkJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5nZVN0YXRlKFwibG9naW5cIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBjb2Rlcy5BUElfSU5WQUxJRF9DUkVERU5USUFMUzpcbiAgICAgICAgICAgICAgICAgICAgICAgICRyb290U2NvcGUuZXJyb3IubWVzc2FnZSA9IFwiQ3JlZGVuY2lhbGVzIGludmFsaWRhc1wiO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2hhbmdlU3RhdGUoXCJsb2dpblwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIGNvZGVzLkFQSV9ST1VURV9OT1RfRk9VTkQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAkcm9vdFNjb3BlLmVycm9yLm1lc3NhZ2UgPSByZXNwb25zZS5tZXNzYWdlO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy9jaGFuZ2VTdGF0ZShcImVycm9yLXJlc3BvbnNlLWhhcy1lcnJvcnNcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyRRSkxvZ2dlci5sb2coXCJBUElfUk9VVEVfTk9UX0ZPVU5ELT5cIityZXNwb25zZS5tZXNzYWdlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihyZXNwb25zZS5tZXNzYWdlICsgXCIgLT4gXCIgKyByZXNwb25zZS51cmwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmluZm8oXCJbUUpFcnJvckhhbmRsZXJdW1VOS05PVyBFUlJPUl1bQ09OVEFDVCBTVVBQT1JUXVwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uXFxcXHNlcnZpY2VzXFxcXGVycm9ySGFuZGxlclNlcnZpY2UuanNcIixcIi8uLlxcXFxzZXJ2aWNlc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBtb2R1bGUgPSByZXF1aXJlKCcuL19tb2R1bGVfaW5pdC5qcycpO1xubW9kdWxlLmZhY3RvcnkoJyRRSkhlbHBlckZ1bmN0aW9ucycsIFtcblx0JyRRSkxvZ2dlcicsICckUUpBcGknLCAnJHJvb3RTY29wZScsICckc3RhdGUnLCAnJHRpbWVvdXQnLCAnJFFKRXJyb3JIYW5kbGVyJyxcblx0ZnVuY3Rpb24oJFFKTG9nZ2VyLCAkUUpBcGksICRyb290U2NvcGUsICRzdGF0ZSwgJHRpbWVvdXQsICRRSkVycm9ySGFuZGxlcikge1xuXHRcdHZhciBzZWxmID0ge307XG5cdFx0c2VsZi5jaGFuZ2VTdGF0ZSA9IGZ1bmN0aW9uKHN0YXRlTmFtZSwgcGFyYW1zLCB0aW1lb3V0KSB7XG5cdFx0XHQkdGltZW91dChmdW5jdGlvbigpIHtcblx0XHRcdFx0JFFKTG9nZ2VyLmxvZygnUUpIZWxwZXIgLT4gU3RhdGUgLT4gZ29pbmcgdG8gJyArIHN0YXRlTmFtZSArICcgIHwgQ3VycmVudCAtPiAnICsgJHN0YXRlLmN1cnJlbnQubmFtZSk7XG5cdFx0XHRcdCRzdGF0ZS5nbyhzdGF0ZU5hbWUsIHBhcmFtcyk7XG5cdFx0XHR9LCB0aW1lb3V0IHx8IDApO1xuXHRcdH07XG5cdFx0c2VsZi5jaGVja1Rva2VuRXhwaXJhdGlvbkFuZEdvVG9Mb2dpblN0YXRlSWZIYXNFeHBpcmVkID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRpZiAoISRyb290U2NvcGUuc2Vzc2lvbiB8fCAoJHJvb3RTY29wZS5zZXNzaW9uICYmIF8uaXNVbmRlZmluZWQoJHJvb3RTY29wZS5zZXNzaW9uLnRva2VuRXhwKSkpIHtcblx0XHRcdFx0JFFKTG9nZ2VyLmxvZygnUUpIZWxwZXIgLT4gVG9rZW4gLT4gbm90IGF2YWxpYWJsZScpO1xuXHRcdFx0XHRzZWxmLmNoYW5nZVN0YXRlKCdsb2dpbicpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoJHJvb3RTY29wZS5zZXNzaW9uICYmICRyb290U2NvcGUuc2Vzc2lvbi50b2tlbkV4cCA9PSBudWxsKSB7XG5cdFx0XHRcdCRRSkxvZ2dlci5sb2coJ1FKSGVscGVyIC0+IFRva2VuIC0+IG5vdCBhdmFsaWFibGUnKTtcblx0XHRcdFx0c2VsZi5jaGFuZ2VTdGF0ZSgnbG9naW4nKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dmFyIG1pbGxpTm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cdFx0XHR2YXIgbWlsbGlEaWZmID0gbWlsbGlOb3cgLSBwYXJzZUludCgkcm9vdFNjb3BlLnNlc3Npb24udG9rZW5FeHApO1xuXHRcdFx0dmFyIGV4cGlyYXRpb25TZWNvbmRzID0gKE1hdGguYWJzKG1pbGxpRGlmZikgLyAxMDAwKTtcblxuXHRcdFx0aWYgKG1pbGxpRGlmZiA+IDApIHtcblx0XHRcdFx0Ly9TaSBlcyBwb3NpdGl2byBzaWduaWZpY2EgcXVlIGVsIHRpZW1wbyBhY3R1YWwgZXMgbWF5b3IgYWwgZGUgZXhwLCBwb3IgbG8gcXVlIGVsIHRva2VuIGV4cGlyby5cblx0XHRcdFx0c2VsZi5jaGFuZ2VTdGF0ZSgnbG9naW4nKTtcblx0XHRcdFx0JFFKTG9nZ2VyLmxvZygnUUpIZWxwZXIgLT4gVG9rZW4gLT4gZXhwaXJlZCcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0JFFKTG9nZ2VyLmxvZygnUUpIZWxwZXIgLT4gVG9rZW4gLT4gZXhwaXJlcyBpbiAnICsgZXhwaXJhdGlvblNlY29uZHMgKyAnIHNlY29uZHMnKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0c2VsZi5nZXRUaW1lc3RhbXBEdXJhdGlvbiA9IGZ1bmN0aW9uKHRpbWVzdGFtcCkge1xuXHRcdFx0dmFyIGR1cmF0aW9uID0ge1xuXHRcdFx0XHRob3VyczogTWF0aC5yb3VuZChNYXRoLmZsb29yKHRpbWVzdGFtcCAvIDEwMDAgLyA2MCAvIDYwKSAlIDI0KSxcblx0XHRcdFx0bWludXRlczogTWF0aC5yb3VuZChNYXRoLmZsb29yKHRpbWVzdGFtcCAvIDEwMDAgLyA2MCkgJSA2MCksXG5cdFx0XHRcdHNlY29uZHM6IE1hdGgucm91bmQoTWF0aC5mbG9vcih0aW1lc3RhbXAgLyAxMDAwKSAlIDYwKVxuXHRcdFx0fTtcblx0XHRcdHZhciBzdHIgPSBcIlwiO1xuXHRcdFx0c3RyICs9IGR1cmF0aW9uLmhvdXJzICsgXCI6XCI7XG5cdFx0XHRzdHIgKz0gZHVyYXRpb24ubWludXRlcyArIFwiOlwiO1xuXHRcdFx0c3RyICs9IGR1cmF0aW9uLnNlY29uZHMgKyBcIlwiO1xuXHRcdFx0cmV0dXJuIHN0cjtcblx0XHR9O1xuXG5cblxuXHRcdC8qXG5cdFx0c2VsZi5jaGVja0FQSUFuZEdvVG9BcGlFcnJvclN0YXRlSWZUaGVyZUlzQVByb2JsZW0gPSBmdW5jdGlvbigpIHtcblx0XHRcdCRRSkFwaS5pc09LKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQkUUpMb2dnZXIubG9nKCdRSkhlbHBlciAtPiBBUEkgLT4gd29ya2luZycpO1xuXHRcdFx0fSwgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdCRRSkxvZ2dlci5sb2coJ1FKSGVscGVyIC0+IEFQSSAtPiBub3QgYXZhbGlhYmxlJyk7XG5cdFx0XHRcdCRRSkVycm9ySGFuZGxlci5oYW5kbGUoJFFKRXJyb3JIYW5kbGVyLmNvZGVzLkFQSV9USU1FT1VUKTtcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0Ki9cblx0XHRyZXR1cm4gc2VsZjtcblx0fVxuXSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uXFxcXHNlcnZpY2VzXFxcXGhlbHBlclNlcnZpY2UuanNcIixcIi8uLlxcXFxzZXJ2aWNlc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBtb2R1bGUgPSByZXF1aXJlKCcuL19tb2R1bGVfaW5pdC5qcycpO1xubW9kdWxlLmZhY3RvcnkoJyRRSkxvY2FsU2Vzc2lvbicsIFtcblx0JyRyb290U2NvcGUnLCAnJGh0dHAnLFxuXHRmdW5jdGlvbigkcm9vdFNjb3BlLCAkaHR0cCkge1xuXHRcdGZ1bmN0aW9uIHNhdmUoKSB7XG5cdFx0XHQkaHR0cC5kZWZhdWx0cy5oZWFkZXJzLmNvbW1vblsnYXV0aC10b2tlbiddID0gJHJvb3RTY29wZS5zZXNzaW9uLnRva2VuO1xuXHRcdFx0c3RvcmUuc2V0KFwicWpfXCIgKyAkcm9vdFNjb3BlLmNvbmZpZy5BcHBJZGVudGlmaWVyICsgXCJfdG9rZW5cIiwgJHJvb3RTY29wZS5zZXNzaW9uLnRva2VuKTtcblx0XHRcdHN0b3JlLnNldChcInFqX1wiICsgJHJvb3RTY29wZS5jb25maWcuQXBwSWRlbnRpZmllciArIFwiX3Nlc3Npb25cIiwgJHJvb3RTY29wZS5zZXNzaW9uKTtcblx0XHRcdHNlc3Npb24gPSAkcm9vdFNjb3BlLnNlc3Npb247XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRsb2FkOiBmdW5jdGlvbigpIHtcblx0XHRcdFx0cmV0dXJuIHN0b3JlLmdldChcInFqX1wiICsgJHJvb3RTY29wZS5jb25maWcuQXBwSWRlbnRpZmllciArIFwiX3Nlc3Npb25cIikgfHwgbnVsbDtcblx0XHRcdH0sXG5cdFx0XHRhZGQ6IGZ1bmN0aW9uKGNiKSB7XG5cdFx0XHRcdCRyb290U2NvcGUuc2Vzc2lvbiA9IHN0b3JlLmdldChcInFqX1wiICsgJHJvb3RTY29wZS5jb25maWcuQXBwSWRlbnRpZmllciArIFwiX3Nlc3Npb25cIikgfHwgbnVsbDtcblx0XHRcdFx0Y2IoJHJvb3RTY29wZS5zZXNzaW9uKTtcblx0XHRcdFx0c2F2ZSgpO1xuXHRcdFx0fSxcblx0XHRcdHNhdmU6IHNhdmVcblx0XHR9XG5cdH1cbl0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJodFpreDRcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLlxcXFxzZXJ2aWNlc1xcXFxsb2NhbFNlc3Npb25TZXJ2aWNlLmpzXCIsXCIvLi5cXFxcc2VydmljZXNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgbW9kdWxlID0gcmVxdWlyZSgnLi9fbW9kdWxlX2luaXQuanMnKTtcbm1vZHVsZS5mYWN0b3J5KCckUUpMb2dnZXInLCBbXG5cdCckcm9vdFNjb3BlJywgJyRzdGF0ZScsICckdGltZW91dCcsXG5cdGZ1bmN0aW9uKCRyb290U2NvcGUsICRzdGF0ZSwgJHRpbWVvdXQpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bG9nOiBmdW5jdGlvbihtc2cpIHtcblx0XHRcdFx0dmFyIGFwcE5hbWUgPSAkcm9vdFNjb3BlLmNvbmZpZy5hcHBOYW1lO1xuXHRcdFx0XHRjb25zb2xlLmluZm8oJ1snICsgYXBwTmFtZSArICddWycgKyBtc2cgKyAnXScpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uXFxcXHNlcnZpY2VzXFxcXGxvZ2dlclNlcnZpY2UuanNcIixcIi8uLlxcXFxzZXJ2aWNlc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBtb2R1bGUgPSByZXF1aXJlKCcuL19tb2R1bGVfaW5pdC5qcycpO1xubW9kdWxlLmZhY3RvcnkoJyRRSkxvZ2luTW9kdWxlJywgW1xuXG5cdCckUUpMb2dnZXInLCAnJFFKQXV0aCcsIFwiJFFKQ29uZmlnXCIsIFwiJFFKQXBpXCIsIFwiJHJlc291cmNlXCIsIFwiJHJvb3RTY29wZVwiLCAnJFFKTG9jYWxTZXNzaW9uJyxcblx0ZnVuY3Rpb24oJFFKTG9nZ2VyLCAkUUpBdXRoLCAkUUpDb25maWcsICRRSkFwaSwgJHJlc291cmNlLCAkcm9vdFNjb3BlLCAkUUpMb2NhbFNlc3Npb24pIHtcblx0XHR2YXIgcnRhID0gbmV3KGZ1bmN0aW9uKCkge1xuXHRcdFx0Ly8tLUNMQVNTIERFRlxuXHRcdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdFx0Ly9cblx0XHRcdHNlbGYubG9naW4gPSBmdW5jdGlvbihsb2dpbm5hbWUsIHBhc3N3b3JkLCBzdWNjZXNzLCBmYWlsdXJlKSB7XG5cdFx0XHRcdHZhciByZXFEYXRhID0ge1xuXHRcdFx0XHRcdFwibG9naW5uYW1lXCI6IGxvZ2lubmFtZSxcblx0XHRcdFx0XHRcInBhc3N3b3JkXCI6IHBhc3N3b3JkLFxuXHRcdFx0XHRcdFwidG9rZW5SZXFcIjogbmV3IERhdGUoKS5nZXRUaW1lKCksXG5cdFx0XHRcdFx0J19ncm91cF9pZCc6ICRyb290U2NvcGUuY29uZmlnLl9ncm91cF9pZCxcblx0XHRcdFx0fTtcblx0XHRcdFx0JFFKTG9nZ2VyLmxvZygnUUpMb2dpbk1vZHVsZSAtPiByZXFEYXRhJyk7XG5cdFx0XHRcdC8vY29uc29sZS5pbmZvKHJlcURhdGEpO1xuXHRcdFx0XHR2YXIgQXV0aCA9ICRRSkFwaS5nZXRDb250cm9sbGVyKFwiYXV0aFwiKTtcblx0XHRcdFx0QXV0aC5wb3N0KHtcblx0XHRcdFx0XHRhY3Rpb246IFwibG9naW5cIixcblx0XHRcdFx0XHRpZ25vcmVjYWNoZTp0cnVlXG5cdFx0XHRcdH0sIHJlcURhdGEsIGZ1bmN0aW9uKHJlcykge1xuXHRcdFx0XHRcdCRRSkxvZ2dlci5sb2coJ1FKTG9naW4gLT4gc3VjY2VzcycpO1xuXHRcdFx0XHRcdCRRSkF1dGgudXBkYXRlU2Vzc2lvbkZyb21Mb2dpbihyZXMpO1xuXHRcdFx0XHRcdHN1Y2Nlc3MoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHNlbGY7XG5cdFx0XHQvLy0tQ0xBU1MgREVGXG5cdFx0fSkoKTtcblx0XHRyZXR1cm4gcnRhOyAvL2ZhY3RvcnkgcmV0dXJuXG5cdH1cbl0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJodFpreDRcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLlxcXFxzZXJ2aWNlc1xcXFxsb2dpblNlcnZpY2UuanNcIixcIi8uLlxcXFxzZXJ2aWNlc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBtb2R1bGUgPSByZXF1aXJlKCcuL19tb2R1bGVfaW5pdC5qcycpO1xubW9kdWxlLmZhY3RvcnkoJyRRSlRpbWUnLCBbXG5cdCckcm9vdFNjb3BlJywgJyRzdGF0ZScsICckdGltZW91dCcsXG5cdGZ1bmN0aW9uKCRyb290U2NvcGUsICRzdGF0ZSwgJHRpbWVvdXQpIHtcblx0XHR2YXIgc2VsZiA9IHt9O1xuXHRcdHNlbGYuZ2V0VGltZXN0YW1wRHVyYXRpb24gPSBmdW5jdGlvbih0aW1lc3RhbXApIHtcblx0XHRcdHZhciBkdXJhdGlvbiA9IHtcblx0XHRcdFx0aG91cnM6IE1hdGgucm91bmQoTWF0aC5mbG9vcih0aW1lc3RhbXAgLyAxMDAwIC8gNjAgLyA2MCkgJSAyNCksXG5cdFx0XHRcdG1pbnV0ZXM6IE1hdGgucm91bmQoTWF0aC5mbG9vcih0aW1lc3RhbXAgLyAxMDAwIC8gNjApICUgNjApLFxuXHRcdFx0XHRzZWNvbmRzOiBNYXRoLnJvdW5kKE1hdGguZmxvb3IodGltZXN0YW1wIC8gMTAwMCkgJSA2MClcblx0XHRcdH07XG5cdFx0XHR2YXIgc3RyID0gXCJcIjtcblx0XHRcdHN0ciArPSBkdXJhdGlvbi5ob3VycyArIFwiOlwiO1xuXHRcdFx0c3RyICs9IGR1cmF0aW9uLm1pbnV0ZXMgKyBcIjpcIjtcblx0XHRcdHN0ciArPSBkdXJhdGlvbi5zZWNvbmRzICsgXCJcIjtcblx0XHRcdHJldHVybiBzdHI7XG5cdFx0fTtcblx0XHRyZXR1cm4gc2VsZjtcblx0fVxuXSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcImh0Wmt4NFwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uXFxcXHNlcnZpY2VzXFxcXHRpbWVTZXJ2aWNlLmpzXCIsXCIvLi5cXFxcc2VydmljZXNcIikiXX0=
