Handlebars.registerHelper('ifeq', function (value, test, options) {
  if (value == test) { return options.fn(this); }
  else { return options.inverse(this); }
});
Handlebars.registerHelper('ifnoteq', function (value, test, options) {
  if (value != test) { return options.fn(this); }
  else { return options.inverse(this); }
});
Handlebars.registerHelper('ifIsFolder', function (options) {
  return this.hasOwnProperty('item') ? options.fn(this) : options.inverse(this);
});
Handlebars.registerHelper('generateRequestID', function (options) {
  var attrs = [];

  for (var prop in options.hash) {
    attrs.push(options.hash[prop]);
  }

  return new Handlebars.SafeString(
    attrs.join('_').replace(/\s+/g, '')
  );
});
Handlebars.registerHelper('sanitise_snippet', function (language, code) {
  var sanitised_code = code;
  if (language === 'cURL') {
    // handle newlines and carriage returns
    sanitised_code = sanitised_code.replace(/\\n|\\r/g, '\n');
    // replace tabs with 4 spaces
    sanitised_code = sanitised_code.replace(/\\t/g, '    ');
    return sanitised_code;
  }
  return code;
});
Handlebars.registerHelper('ifempty', function (value, options) {
  if (_.isEmpty(value)) {
    return options.fn(this);
  }
  else {
    return options.inverse(this);
  }
});
Handlebars.registerHelper('ifnotempty', function (value, options) {
  if (!_.isEmpty(value)) {
    return options.fn(this);
  }
  else {
    return options.inverse(this);
  }
});
Handlebars.registerHelper('get', function (object, key, options) {
  return _.get(object, key);
});
Handlebars.registerHelper('hasRequestBody', function (value, options) {
  if (!value || _.isEmpty(value)) {
    return options.inverse(this);
  }
  else if (_.isPlainObject(value)) {
    if (!value.mode) {
      return options.inverse(this);
    }
    else if (value.mode && ((_.isPlainObject(value.mode) && _.isEmpty(value[value.mode])) || !value[value.mode])) {
      return options.inverse(this);
    }
    else {
      return options.fn(this);
    }
  }
  else {
    return options.fn(this);
  }
});
