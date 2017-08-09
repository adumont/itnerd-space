!function () {
  var envData = document.getElementById('public-run-button-env'),
    envName = envData.dataset.envName,
    envValues = JSON.parse(envData.dataset.envValues);

  _pm("env.create", envName, envValues);
}();
