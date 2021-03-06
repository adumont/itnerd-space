/* globals $,document,window,Handlebars,Prism,_,RegExp */
/* jshint latedef: nofunc */
var initialJson,
  collectionJson,
  environmentMapping = {},
  envLabel,
  scope = {},
  toc = {},
  privateDocUrl,
  activeFolder,
  collectionVariantsExist = false;

$(document).ready(bootstrapView);

function bootstrapView () {
  var collection;

  try {
    applyBranding();
    populateScope();
    getInitialJson(function (response) {
      var $publicUrl = $('.public-url');

      initialJson = response;
      collectionJson = getInitialCollectionJson();
      collection = _.cloneDeep(collectionJson);
      buildEnvironmentMapping(initialJson.environments);
      attachSidebarHandlers();

      if (collectionJson && collectionJson.info.public) {
        var environmentData = environmentMapping[$('.active-environment').data('environment-id')];

        collection = substituteObjectVars(collectionJson, environmentData);

        // Variable needed by GTM
        envLabel = $('.active-environment').text() === 'No Environment' ? 'no-env' : 'env';
        privateDocUrl = collectionJson.info.privateUrl;
      }

      messenger.bootstrap(function () {
        // Display any queued messages
        messenger.showAll();
      });

      // If this is the publish page, fetch custom domains & bind necessary handlers
      $('.publish-section-custom-domain').length && fetchCustomDomains() || $publicUrl.show();
      $('.publish-block').length && bindPublishPageHandlers();

      populateDataIntoTemplate('doc-sidebar', collection);
      wrapExpandables();
      attachHandlers();
      highlightVisibleSnippets();
      buildToC();
      showLiveDocBanner();
      adjustDocumentPadding($('.pm-message-persistent'));

      scrollToHash();
    });
  }
  catch (e) {
    console.error(e);
  }
}

/**
 * Extracts variables from data-attributes and populate them into a variable for access within the script.
 */
function populateScope () {
  var $hook = $('#script-data-scope'),
    attrs;

  // Isolate data attributes & pull just those which have the var-* prefix
  attrs = $hook.data();

  // Assign each value into the scope, do not override existing values
  _.forEach(attrs, function (value, key) {
    var varName = _.camelCase(key.replace(/^var/i, ''));

    key.match(/^var/) &&
      !_.has(scope, varName) &&
      (scope[varName] = value);
  });
};

function applyBranding () {
  $identity = $('.branded-logo');
  $identity
    .css('background-image', 'url("' + $identity.data('identity-href') + '")')
    .removeData('identity-href');
}

// Wrap large expandable elements in a div, which will allow us to limit the height/width
// of the element and allow for click-to-expand behavior
function wrapExpandables (sel) {
  // Wrap snippets
  !function () {
    var $snippets = $('.is-snippet-wrapper').filter(':visible');

    _.forEach($snippets, function (snippet) {
      var snippetHeight = snippet.clientHeight,
        codeHeight,
        $snippet;

      // This snippet is most likely limited via CSS
      // The value we're looking for is 200, but since we're comparing with clientHeight (which doesn't include borders)
      // we're using 198 as the comparison, allowing for a 1px border. We could use offsetHeight instead, but that's
      // considered slower than clientHeight.
      if (snippetHeight >= (200 - 2)) {
        snippet.className.indexOf('is-expandable') === -1 &&
          (snippet.className += ' is-expandable');
      }
    });
  }();

  // Wrap tables in the markdown
  !function () {
    var $tables = $('.is-table-wrapper');

    _.forEach($tables, function (table) {
      var tableHeight = table.clientHeight,
        tableWidth = $(table).children('table').get(0).clientWidth,
        maxWidth = table.clientWidth,
        codeHeight,
        $table;

      // This table is most likely limited via CSS
      if (tableHeight >= 500 || tableWidth > maxWidth) {
        table.className.indexOf('is-expandable') === -1 &&
          (table.className += ' is-expandable');
      }
    });
  }();
}

function enforceTableWidth () {
  $('.md-table-container').each(function(index, tableContainer) {
    var columns = tableContainer.querySelector('tr').cells.length;
    $(this).css('width', columns * 150);
  });
}

function populateDataIntoTemplate (templateName, data) {
  var template = Handlebars.templates[templateName],
    $docs = $('#doc-body');

  $docs
    .html(template(data))
    .removeClass('is-loading');

  prepareView();

  // Set dynamic width of the table in the next tick when the tables are rendered.
  setTimeout(function() {
    enforceTableWidth();
  });

  // Adding event listener for responses dropdown menus for all requests
  $('.response-name .dropdown-menu li').click(changeResponse);
}

function prepareView () {
  beautifyResponse();

  // Displaying the first request and response by default for all requests.
  displayDefaultRequests();

  displayDefaultResponses();

  bindScrollHandler();

  scrollToHash();
}

function scrollToHash () {
  var $target = $(window.location.hash);
  $target.length && $('body').scrollTop($target.offset().top);
}

function attachHandlers () {
  // Adding event listener for responses dropdown menus for all requests
  $('.response-name li').click(changeResponse);

  // Adding event listener for change in language.
  $('.language_dropdown').on('click', '.dropdown-menu-item', changeAllRequests);

  $('body').on('click', '.is-expandable', showInModal);

  $('.shared-environment-dropdown li').on('click', function () {
    setEnvironmentMeta($(this));
  });

  $('.environment-dropdown li').on('click', function () {
    var environmentId = $(this).data('environment-id'),
      selectedEnvironmentId = $('.active-environment').data('environment-id'),
      collectionJson;

    if (environmentId === selectedEnvironmentId) {
      return;
    }
    // This indicates the user chose No Environment
    else if (environmentId === 0){
      collectionJson = getInitialCollectionJson();
      setEnvironmentMeta($(this));
      populateDataIntoTemplate('doc-sidebar', collectionJson);
      attachHandlers();
    }
    else {
      displayCollectionWithEnvironment.bind($(this))(environmentId);
    }

    highlightVisibleSnippets();
  });

  bindPublishButtonHandler();

  $('#unpublish_button').on('click', function () {
    var $form = $('#unpublish_collection');
    setTimeout(function() {
      $form.submit();
    }, 500);
  });

  // attaching events to capture clicks on clickboard elements. These elements are used to copy text.
  new Clipboard('.copy-text');
  var requestClipboard = new Clipboard('.copy-request');

  requestClipboard.on('success', function(e) {
    $(e.trigger).addClass('copied');

    setTimeout(function() {
      $(e.trigger).removeClass('copied');
    }, 1000);

    // Remove comments to prevent selecting copied text
    e.clearSelection();
  });

  $('.settings-toggle').on('click', function () {
    $('#mobile-controls').toggleClass('is-visible');
  });
}

function attachSidebarHandlers () {
  $('.folder .toggle-folder-collapse').on('click', toggleFolderState);

  $('.folder-link>a').on('click', activateFolder);

  // Simulating clicking on folder name , when folder icon is clicked.
  $('.pm-doc-sprite-folder').on('click', function () {
    $(this).siblings('.folder-link').find('a')[0].click();
  });

  // Menu toggle button on tablet and mobile.
  $('body')
    .on('click', '#menu-toggle', function () {
      $('body').toggleClass('nav-open');
    })
    .on('click', '.nav a', function () {
      // Do this inside a setTimeout so the hash has a chance to update
      setTimeout(function () {
        $('body').removeClass('nav-open');
        scrollToHash();
      }, 0);
    });
}

function activateFolder () {
  var $folderLink = $(this),
    // parent li with class folder
    $folderLi = $(this).closest('.folder'),
    allFolders = $('.folder-link>a');

  if ($folderLi.hasClass('open')) {
    $folderLink.hasClass('active') && collapseFolder($folderLi);
  }
  else {
    allFolders.removeClass('active-folder');
    expandFolder($folderLi);
  }
}

function bindScrollHandler () {
  $(window)
    .on('scroll resize pm-notification-closed', adjustDocumentPadding.bind(this, $('.pm-message-persistent')))
    .on('scroll', _.debounce(highlightVisibleSnippets, 50));
}

function adjustDocumentPadding ($persistentMessage) {
  var scrollTop = $(window).scrollTop(),
    $persistentWrap = $persistentMessage.parents('.pm-persistent-notification-container'),
    headerHeight = 70,
    persistentHeight = 0;

  $persistentMessage && $persistentMessage.length && (persistentHeight = $persistentMessage.outerHeight());
  if(scrollTop > headerHeight) {
    scrollTop = headerHeight;
    $persistentWrap.addClass('is-fixed');
  } else {
    $persistentWrap.removeClass('is-fixed');
  }

  $('.sidebar').css('padding-top', (headerHeight + persistentHeight - scrollTop) + 'px');
  $('.container-fluid').css('padding-top', persistentHeight + 'px');
}

function displayCollectionWithEnvironment (environmentId) {
  var environmentData = environmentMapping[environmentId],
    collectionWithEnvironment;

  setEnvironmentMeta($(this));
  collectionWithEnvironment = substituteObjectVars(collectionJson, environmentData);

  populateDataIntoTemplate('doc-sidebar', collectionWithEnvironment);
  wrapExpandables();
  attachHandlers();
}

function setEnvironmentMeta ($selectedEnvironment) {
  $('.active-environment')
    .text($selectedEnvironment.text())
    .data('environment-id', $selectedEnvironment.data('environment-id'));
}

function getInitialCollectionJson () {
  // The initial json is stored in the dom and is populated into the dom on first load.
  return initialJson.collection;
}

function getInitialJson (cb) {
  var id = $('meta[name="cmodelID"]').attr('content'),
    ownerId = $('meta[name="ownerId"]').attr('content'),
    publishedId = $('meta[name="publishedId"]').attr('content'),
    api = scope.host + '/api/collection/' + id;

  if (!id && ownerId && publishedId) {
    api = scope.host + '/api/collection/' + ownerId + '/' + publishedId;
    api = "http://itnerd.space/otherstuff/API/TPLink/tplink.json"
  }

  // Require either id, or ownerId & publishedId before sending the getJSON request
  if (id || (ownerId && publishedId)) {
    $.getJSON(api)
      .done(function (data, status, jqxhr) {
        console.log('getInitialJson.done', arguments);
        return cb(data);
      })
      .fail(function (jqxhr, status, statusText) {
        console.log('getInitialJson.fail', arguments);
        return cb({});
      });
  }
  else {
    cb({});
  }
}

function highlightParentFolder ($activeElement) {
  var isFolder = $activeElement.parent().hasClass('folder-link'),
    $currentFolder = $activeElement.closest('.folder'),
    $currentFolderLink = $currentFolder.find('.folder-link:first a');

  // If the active element is a folder , then it has no ancestor folder. We just need to remove active-folder
  // class from already highlighted folders if any.
  if (isFolder) {
    $('.folder-link a').removeClass('active-folder');
    return;
  }

  // the current request is not in any folder
  if ($currentFolder.length === 0) {
    return;
  }

  // If ancestor folder was already highlighted.
  if ($currentFolderLink.hasClass('active-folder')) {
    return;
  }

  // If request has an ancestor folder and its not already highlighted then
  // highlight it and remove highlighting from all other folders.
  $('.folder-link a').removeClass('active-folder');
  $currentFolderLink.addClass('active-folder');
}

function openFolder ($folder) {
  $folder
    .toggleClass('open')
    .find('ul:first')
      .toggleClass('display-requests');
}

function showInModal () {
  var $content = $(this).clone(),
    width = $content.css('width');

  $content.removeClass('is-expandable');

  $('#rawBodyModal')
    .addClass('white-background')
    .modal()
    .find('.modal-body')
      .empty()
      .append($content)
      .css('width', width || 'auto');
}

function collapseFolder ($folder) {
  $folder
    .removeClass('user-opened open')
    .find('ul:first')
      .removeClass('display-requests');
  return true;
}

function expandFolder ($folder) {
  $folder
    .addClass('open user-opened')
    .find('ul:first')
      .addClass('display-requests user-opened');
  return true;
}

function toggleFolderState () {
  var $thisFolder = $(this).closest('.folder');
  $thisFolder.hasClass('open') && collapseFolder($thisFolder) || expandFolder($thisFolder);
}

// Method which parses response text strings and populates them.
function beautifyResponse () {
  var responseText,
    responseLanguage;
  _.forEach($('.formatted-responses'), function (responseDiv) {
    responseDiv = $(responseDiv);
    responseText = responseDiv.text();
    responseLanguage = responseDiv.attr('data-lang');
    try {
      responseText = JSON.parse(responseText);
      responseText = JSON.stringify(responseText, null, 2);
    }
    catch (e) {
    }
    populateSnippet(responseDiv, responseText, responseLanguage);
  });
}

function updateLanguage (langPreference) {
  $('.active-lang').text(langPreference);
  $('.formatted-requests[data-lang="' + langPreference + '"][data-id$="_0"]').show();
}

function displayDefaultRequests () {
  var langPreference = $('.active-lang:visible').text() || 'cURL';

  try {
    langPreference = localStorage.getItem('lang_preference') || langPreference;
  }
  catch (err) {
    console.log("Failed to get from localstorage with error => ", err)
  }

  updateLanguage(langPreference);
}

function displayDefaultResponses () {
  $('.formatted-responses[data-id$="_0"]').show();
}

// This changes the request and response for one particular request on selection from the dropdown for request name.
function changeResponse () {
  // Request info has info related to response number and response name has the id of request.
  var $this = $(this),
    request_info = $this.data('request-info'),
    request_name = $this.data('request-name');

  // Hiding all responses and requests for this request
  $('.formatted-requests[data-id^=' + request_name + ']').hide();
  $('.formatted-responses[data-id^=' + request_name + ']').hide();

  // Selectively showing only one request and response.
  $('.formatted-requests[data-id=' + request_info + '][data-lang="' + $('.active-lang:first').text() + '"]').show();
  $('.formatted-responses[data-id=' + request_info + ']').show();

  // Changing the text of the selected box.
  $('#' + request_name + '_dropdown .response-name-label').html($this.text());

  // Highlight the things we just displayed
  highlightVisibleSnippets();
}

// Change all request snippets based on the new language selected.
function changeAllRequests () {
  var selected_lang = $(this).text(),
    request_reference,
    visible_requests = $('.formatted-requests:visible');

  $('.active-lang').text(selected_lang);

  try {
    localStorage.setItem('lang_preference', selected_lang);
  }
  catch (err) {
    console.log("Failed to set localStorage with error => ", err);
  }

  $('.formatted-requests').hide();

  _.forEach(visible_requests, function (visibleRequest) {
    setTimeout(function () {
      request_reference = $(visibleRequest).data('id');
      $('.formatted-requests[data-lang="' + selected_lang + '"][data-id="' + request_reference + '"]').show();
    }, 0);
  });

  setTimeout(function () {
    wrapExpandables();
    highlightVisibleSnippets();
  }, 0);
}

function populateSnippet (divElement, snippet, language) {
  var markupLanguages = ['html', 'xml']

  if (markupLanguages.indexOf(language) >= 0) {
    divElement.html('<pre class="click-to-expand-wrapper is-snippet-wrapper"><code class="language-markup"></code></pre>');
  }
  else {
    divElement.html('<pre class="click-to-expand-wrapper is-snippet-wrapper"><code class="language-javascript"></code></pre>');
  }

  divElement.find('code').text(snippet);
}

// Method to get value for a query parameter using theri name
// Source - http://stackoverflow.com/questions/901115/how-can-i-get-query-string-values-in-javascript
function getParameterByName (name) {
  var match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
  return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
}

function buildEnvironmentMapping (environments) {
  _.forEach(environments, function (env) {
    environmentMapping[env.id] = convertArrayToFlatObject(env.values);
  });
}

function convertArrayToFlatObject (envValues) {
  return _.reduce(envValues, function (result, envVariable) {
    (result[envVariable.key] = envVariable.value);
    return result;
  }, {});
}

function substituteObjectVars (object, environment) {
  var self = this;
  var substitutedData = object;

  if (typeof object === "boolean") return object;

  substitutedData = _.reduce(object, function (accumulator, value, key) {
    var subsKey = self.substituteVars(key, environment),
      subsValue = value;

    if (_.isString(value)) {
      subsValue = self.substituteVars(value, environment);

      // If the first bit of the original URL was an environment variable, the RSG output would prepend
      // an additional http://. If the environment variable contained the protocol in the value as well,
      // then the substituted snippet would end up having two protcols. Here, we check for duplication
      // and replace.
      subsValue.match('http:\/\/https?:\/\/') && (subsValue = subsValue.replace(/http:\/\/http/gi, 'http'));
    }
    else if (_.isArray(value)) {
      subsValue = _.map(value, function (eachValue) {
        return _.isString(eachValue) ?
          self.substituteVars(eachValue, environment) : self.substituteObjectVars(eachValue, environment);
      });
    }
    else {
      subsValue = self.substituteObjectVars(value, environment);
    }

    accumulator[subsKey] = subsValue;

    return accumulator;
  }, {});

  collectionVariantsExist = !_.isEqual(object, substitutedData) || collectionVariantsExist;
  return substitutedData;
}

function substituteVars (template, variables) {
  //don't touch the template if it is not a string
  if (typeof template !== 'string') {
    return template;
  }
  // if view is not a valid object, assume it is an empty object which effectively removes all variable assignments
  if (typeof variables !== 'object' || variables === null) {
    variables = {};
  }
  return template.replace(/\{?\{\{\s*(.*?)\s*\}\}\}?/g, function (match, varName) {
    var value = variables[varName];
    return (value && value.toString && typeof value !== 'function') ? value.toString() : match;
  });
}

function buildToC () {
  var $source = $('.collection-description h1');

  $source.each(function (i, heading) {
    var raw = $(heading).html(),
      slugOpts = {
        lower: true
      },
      id = slug(raw, slugOpts),
      template = Handlebars.templates['toc-item'],
      $tocWrapper = $('.toc ul'),
      data = {},
      html;

    !id && (id = 'section');

    // If the id has already been assigned, increment its index by one.
    // Otherwise, set the index as 1. The id is only appended to the
    // hash if it's greater than 1.
    if(toc.hasOwnProperty(id)) {
      toc[id]++;
      id = [id, toc[id]].join('-');
    } else {
      toc[id] = 1;
    }

    data.id = id;
    data.name = raw;

    heading.id = data.id;

    html = template(data);
    $(html).appendTo($tocWrapper);
  });
}

function showLiveDocBanner () {
  var host = window.location.hostname;

  !host.match(/documenter.*\.getpostman\.com/) && host.match(/\.getpostman\.com$/) &&
    $('#live-documentation-banner').removeClass('is-hidden');
}

/**
 * Depending on the button, binds a handler to the publish button. If the button
 * has a `href` defined, a handler to build the publish URL is bound. Otherwise.
 * a tooltip is bound.
 */
function bindPublishButtonHandler () {
  var $cta = $('#initiate_publish_button');

  ($cta && $cta[0] && $cta[0].hasAttribute('href') && $cta.on('click', modifyPublishURL)) ||
    $cta.on('click', togglePublishTooltip);
}

function togglePublishTooltip () {
  $('.tt-block-publish').toggleClass('in');
}

// Adding meta to send to server when publish is initiated.
function modifyPublishURL () {
  var path = window.location.pathname,
    // composite id
    cId = path.split('/').slice(-1)[0].split('-'),
    owner = cId[0],
    collectionId = cId.slice(1).join('-'),
    params = $.param({
      collection_id : collectionId,
      owner: owner,
      collection_name: initialJson.collection.info.name
    }),
    // Stupid hack , remove when you change the Publish button to do a form POST
    href = ($(this).attr('href').indexOf('meta') > 0) ? $(this).attr('href') :
      ($(this).attr('href') + '?meta=' + window.btoa(params));

  $(this).attr('href', href);
}

////////////////////////////////////////////////
// Custom domain operations on publish screen //
////////////////////////////////////////////////

/**
 * Fetch custom domains from DVS
 */
function fetchCustomDomains () {
  var $errorMessage = $('.custom-domain-error-message'),
    $loader = $('.custom-domain-activity-indicator');

  $.get({
    url: scope.host + '/domains',
    headers: {'Accept': 'application/json'}
  })
    .done(function (data) {
      //@todo: This is done for backward compatibility. Need to clear that later.
      renderCustomDomainDropdownItems(data.result || data.domains);
    })
    .fail(function (jqXHR) {
      var response = JSON.parse(jqXHR.responseText),
        $publicUrl = $('.public-url'),
        $heading = $('.publish-section-custom-domain h5'),
        defaultError = 'Something went wrong while loading your custom domains.';

      console.log(_.get(response, 'error', defaultError));
      $publicUrl.show();
      $heading.hide();
    })
    .always(function () {
      $loader.hide();
    });
};

/**
 * Given an array of domain objects, renders them into the UI. This function is *not* idempotent,
 * it will *append* the given domains the UI list.
 * @param  {Array}  domains   An array of domain objects
 */
function renderCustomDomainDropdownItems (domains) {
  var rendered = [],
    $domainsDropdown = $('.publish-section-custom-domain .dropdown'),
    $domainsList = $('.publish-section-custom-domain .dropdown-menu'),
    $customDomainFqdn = $('#custom_domain_fqdn'),
    currentDomainFqdn = $customDomainFqdn.val(), // Pre-populated from the backend, this doc already has an fqdn
    $publicUrl = $('.public-url'),
    $slugUrl = $('.slug-url'),
    currentDomain;

  _.forEach(domains, function (domain) {
    var postfix = '',
      $base = $('.publish-section-custom-domain .dropdown-menu li:first-child').clone(),
      isCurrent = false;

    // Check if this custom domain is already associated with this published documentation
    // If it is, don't mark this as unavailable
    domain.fqdn === currentDomainFqdn && (currentDomain = domain, isCurrent = true);

    // Pick a label postfix based on the domain status
    // These assigments are done in order of precedence. i.e. Unavailability is more important that verification status
    !domain.verified && (postfix = '(unverified)');
    !isCurrent && _.get(domain, 'upstream.url') && (postfix = '(unavailable)');

    // Add this to the domain object, we're going to use it later to determine the UI state
    _.assign(domain, {
      label: domain.fqdn + ' ' + postfix
    });

    // Update the cloned DOM
    $base
      .data('domain-id', domain.id)
      .data('domain-fqdn', domain.fqdn)
      .data('domain-collection-id', _.get(domain, 'publishData.collectionId'))
      .data('domain-owner-id', _.get(domain, 'publishData.owner'))
      .text(domain.label);

    rendered.push($base);
  });

  // Show the domains dropdown and render domain options
  $domainsDropdown.show();
  $domainsList.append(rendered);
  $publicUrl.show();
  currentDomain && $slugUrl
    .text('https://' + currentDomain.fqdn)
    .attr('href', 'https://' + currentDomain.fqdn);

  // Pre-select a domain if one is already assigned to this published documentation
  currentDomain && selectCustomDomain(currentDomain);
};

/**
 * Select a domain in the custom domain dropdown on the Publish page
 * @param  {Object}   activeDomain  A domain object, as received from the DVS API
 */
function selectCustomDomain (domain) {
  var $customDomainId = $('#custom_domain_id'),
    $customDomainFqdn = $('#custom_domain_fqdn'),
    $domainButton = $('.publish-section-custom-domain .dropdown-button');

  $customDomainId.val(domain.id);
  $customDomainFqdn.val(domain.fqdn);
  $domainButton.text(domain.label);

  toggleDomainHelpTextVisibility(domain.label);
};

/**
 * Toggles visibility of different helptext elements depending on whether or not the `label` passes a test.
 * @param  {String}   label   A custom domain label which is usually structured something like
 *                            `<fqdn> (unavailable/unverified)`
 * @param  {$element} $el   An element which contains additional information about the domain
 */
function toggleDomainHelpTextVisibility (label, $el) {
  var $publishButton = $('.publish-button'),
    helptext = {
      unverified: {
        el: $('#custom-domain-message__is-unverified')
      },
      unavailable: {
        el: $('#custom-domain-message__is-unavailable'),
        renderer: function () {
          var $view = $('.custom-domain-message__helptext'),
            data = $el.data(),
            privateDocUrl = '/collection/view/' + data.domainOwnerId + '-' + data.domainCollectionId;

          if (data.domainOwnerId == scope.userId) {
            $view
              .addClass('is-owner')
              .find('a')
                .attr('href', privateDocUrl);
          }
          else {
            $view.removeClass('is-owner');
          }

          $publishButton.attr('disabled', 'disabled');
        }
      }
    };

  _.isString(label) && _.forEach(helptext, function (text, tag) {
    $publishButton.attr('disabled', null);

    if (label.match(new RegExp('\\(' + tag + '\\)$'))) {
      text.el.show();
      typeof text.renderer === 'function' && text.renderer();
    }
    else {
      text.el.hide();
    }
  });
};

/**
 * Handle the binding of handlers needed on the Publish page
 * @return {[type]} [description]
 */
function bindPublishPageHandlers () {
  $('body')
    .on('click', '.publish-section-custom-domain li', function () {
      var $this = $(this),
        label = $this.text();

      $('.publish-section-custom-domain .dropdown-button').text(label);
      $('#custom_domain_id').val($this.data('domain-id'));
      $('#custom_domain_fqdn').val($this.data('domain-fqdn'));

      toggleDomainHelpTextVisibility(label, $this);
    })
    .on('click', '.shared-environment-dropdown li', function () {
      $('.shared-environment-dropdown .dropdown-button').text($(this).text());
      $('#environment_template_id').val($(this).data('environment-id'));
      $('#environment_owner').val($(this).data('owner'));
    });
};

//////////////////////////////////////////////////////////////////
// Dynamically applying syntax highlighting based on visibility //
//////////////////////////////////////////////////////////////////

function highlightVisibleSnippets () {
  var snippets = document.querySelectorAll('pre code'),
    visibleSnippets = [],
    // Isolate the highlighted elements
    highlightedSnippets = document.querySelectorAll('pre code.is-highlighted');

  // Isolate the visible snippet elements
  _.forEach(snippets, function (snippet) {
    elementIsVisible(snippet) && visibleSnippets.push(snippet);
  });

  // Remove existing highlights, excluding those which are still visible
  _.forEach(highlightedSnippets, function (snippet) {
    var $snippet;

    // Replacing the contents with the text will remove all the HTML elements injected
    // while applying syntax highlighting
    if (_.indexOf(visibleSnippets, snippet) === -1) {
      $snippet = $(snippet);
      $snippet
        .text($snippet.text())
        .removeClass('is-highlighted');
    }
  });

  // Apply syntax highlighting on just the visible elements, excluding those which are already highlighted
  _.forEach(visibleSnippets, function (snippet) {
    if (_.indexOf(highlightedSnippets, snippet) === -1) {
        $(snippet).addClass('is-highlighted');
        Prism.highlightElement(snippet);
      }
  });
};

function elementIsVisible (el) {
  var bounds = el.getBoundingClientRect(el),
    viewport = {
      height: window.innerHeight,
      widht: window.innerWidth
    },
    isPartiallyVisible,
    isOverflowingScreen;

  // If either the top OR the bottom of the element is within the screen, the element is considered visible
  isPartiallyVisible = (bounds.top < viewport.height && bounds.top > 0) ||
    (bounds.bottom < viewport.height && bounds.bottom > 0);

  // If the top of the element is above the screen AND bottom of the element is below the fold, the
  // element is still considered visible
  isOverflowingScreen = bounds.top < 0 && bounds.bottom > viewport.height;

  return isPartiallyVisible || isOverflowingScreen;
};
