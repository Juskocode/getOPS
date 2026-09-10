include(FetchContent)

set(JSON_BuildTests OFF CACHE INTERNAL "")
set(JSON_Install OFF CACHE INTERNAL "")
FetchContent_Declare(
  nlohmann_json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG v3.12.0
  GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(nlohmann_json)

set(HTTPLIB_INSTALL OFF CACHE INTERNAL "")
set(HTTPLIB_TEST OFF CACHE INTERNAL "")
FetchContent_Declare(
  cpp_httplib
  GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
  GIT_TAG v0.50.1
  GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(cpp_httplib)

if(APPLE)
  execute_process(
    COMMAND brew --prefix libpq
    OUTPUT_VARIABLE GETOPS_LIBPQ_PREFIX
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
  )
  if(GETOPS_LIBPQ_PREFIX)
    list(PREPEND CMAKE_PREFIX_PATH "${GETOPS_LIBPQ_PREFIX}")
    set(PostgreSQL_ROOT "${GETOPS_LIBPQ_PREFIX}")
  endif()
endif()
find_package(PostgreSQL REQUIRED)

add_library(
  getops_domain
  src/catalog.cpp
  src/recall.cpp
  src/state_validator.cpp
)
add_library(getops::domain ALIAS getops_domain)

target_compile_features(getops_domain PUBLIC cxx_std_20)
target_include_directories(getops_domain PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/include")
target_link_libraries(getops_domain PUBLIC nlohmann_json::nlohmann_json)

if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
  target_compile_options(
    getops_domain
    PRIVATE
      -Wall
      -Wextra
      -Wpedantic
      -Wconversion
      -Wshadow
  )
endif()

add_library(getops_repository src/profile_repository.cpp)
add_library(getops::repository ALIAS getops_repository)
target_compile_features(getops_repository PUBLIC cxx_std_20)
target_include_directories(getops_repository PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/include")
target_link_libraries(
  getops_repository
  PUBLIC
    getops::domain
    PostgreSQL::PostgreSQL
)
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
  target_compile_options(
    getops_repository
    PRIVATE
      -Wall
      -Wextra
      -Wpedantic
      -Wconversion
      -Wshadow
  )
endif()

add_executable(
  getops_api
  src/api_server.cpp
  src/config.cpp
  src/main.cpp
)
target_compile_features(getops_api PRIVATE cxx_std_20)
target_include_directories(getops_api PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/include")
target_link_libraries(
  getops_api
  PRIVATE
    getops::repository
    httplib::httplib
)
target_compile_definitions(getops_api PRIVATE GETOPS_VERSION="${PROJECT_VERSION}")
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
  target_compile_options(
    getops_api
    PRIVATE
      -Wall
      -Wextra
      -Wpedantic
      -Wconversion
      -Wshadow
  )
endif()

if(BUILD_TESTING)
  add_executable(getops_catalog_recall_test tests/catalog_recall_test.cpp)
  target_link_libraries(getops_catalog_recall_test PRIVATE getops::domain)
  target_compile_definitions(
    getops_catalog_recall_test
    PRIVATE
      GETOPS_TEST_CATALOG="${PROJECT_SOURCE_DIR}/content/flashcards.json"
  )
  add_test(NAME getops.catalog_recall COMMAND getops_catalog_recall_test)

  add_executable(getops_state_validator_test tests/state_validator_test.cpp)
  target_link_libraries(getops_state_validator_test PRIVATE getops::domain)
  target_compile_definitions(
    getops_state_validator_test
    PRIVATE
      GETOPS_TEST_CATALOG="${PROJECT_SOURCE_DIR}/content/flashcards.json"
  )
  add_test(NAME getops.state_validator COMMAND getops_state_validator_test)

  add_executable(getops_repository_integration_test tests/repository_integration_test.cpp)
  target_link_libraries(getops_repository_integration_test PRIVATE getops::repository)
  add_test(NAME getops.repository_integration COMMAND getops_repository_integration_test)
  set_tests_properties(getops.repository_integration PROPERTIES SKIP_RETURN_CODE 77)
endif()
