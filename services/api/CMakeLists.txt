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
  add_test(NAME getops.state_validator COMMAND getops_state_validator_test)
endif()
